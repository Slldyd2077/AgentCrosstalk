/**
 * `act-mcp` — exposes act's cross-machine commands as MCP tools so Claude Code
 * can call them natively (and orchestrate multi-step workflows autonomously).
 *
 * Each tool reuses the same core (Remote, diff-engine, zerotier, …) as the CLI,
 * but returns structured results instead of streaming to a terminal.
 *
 * Register once:  `claude mcp add act -- node dist/mcp-server.js`
 */
import os from "node:os";
import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { requireConfig } from "./core/config.js";
import { findPeer } from "./core/peers.js";
import { Remote } from "./core/remote.js";
import { buildClaudeCommand } from "./core/claude-invocation.js";
import { parseClaudeResult } from "./core/claude-result.js";
import { listMembers } from "./util/zerotier.js";
import { buildRemoteHashCommand, compareTrees, hashLocalTree, parseRemoteHashes } from "./core/diff-engine.js";
import type { Config, Peer, TalkOptions } from "./protocol/types.js";
import { VERSION } from "./version.js";

const server = new McpServer({ name: "act", version: VERSION });

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

function text(obj: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

async function safe(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `act error: ${(e as Error).message}` }] };
  }
}

function resolvePeer(host: string, cfg: Config): Peer {
  return findPeer(cfg.peers, host) ?? { name: host, ip: host, user: os.userInfo().username, port: cfg.sshPort };
}

async function connect(host: string): Promise<{ remote: Remote; peer: Peer; cfg: Config }> {
  const cfg = requireConfig();
  const peer = resolvePeer(host, cfg);
  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });
  return { remote, peer, cfg };
}

// ── act_peers ───────────────────────────────────────────────────────────────
server.tool("act_peers", "List machines on the ZeroTier network (name, IP, OS).", {}, async () =>
  safe(async () => {
    const cfg = requireConfig();
    if (!cfg.zerotier) throw new Error("No ZeroTier config. Run `act init` first.");
    const members = await listMembers(cfg.zerotier.token, cfg.zerotier.networkId, cfg.zerotier.apiBase);
    return members.map((m) => ({ name: m.name || m.nodeId, ip: m.ip, os: m.os ?? null }));
  }),
);

// ── act_talk ────────────────────────────────────────────────────────────────
server.tool(
  "act_talk",
  "Run a task in Claude Code on a peer machine and return its result. WARNING: defaults to bypassPermissions on the peer (full tool access) so it can take real action.",
  {
    host: z.string().describe("peer name, ZeroTier IP, or nodeId"),
    task: z.string().describe("the task for the peer's Claude"),
    project: z.string().optional().describe("project dir on the peer to run in"),
    permissionMode: z
      .string()
      .optional()
      .describe("default|acceptEdits|plan|bypassPermissions (default bypassPermissions)"),
  },
  async (args) =>
    safe(async () => {
      const { remote, peer } = await connect(args.host);
      try {
        const claudePath = peer.claudePath ?? (await remote.detectClaudePath());
        const cmd = buildClaudeCommand({
          claudePath,
          task: args.task,
          project: args.project ?? peer.defaultProject,
          permissionMode: (args.permissionMode as TalkOptions["permissionMode"]) ?? "bypassPermissions",
          outputFormat: "json",
        });
        const r = await remote.execCapture(cmd);
        const summary = parseClaudeResult(r.stdout);
        if (r.code !== 0 && !summary.answer) summary.answer = `[exit ${r.code}] ${r.stderr}`;
        return summary;
      } finally {
        remote.close();
      }
    }),
);

// ── act_diff ────────────────────────────────────────────────────────────────
server.tool(
  "act_diff",
  "Diff a project directory between this machine and a peer. Returns added/removed/modified files.",
  {
    host: z.string(),
    path: z.string().optional().describe("local dir (default: cwd)"),
    remotePath: z.string().optional().describe("dir on the peer (default: same as path)"),
  },
  async (args) =>
    safe(async () => {
      const { remote, peer } = await connect(args.host);
      try {
        const localDir = path.resolve(args.path ?? process.cwd());
        const remoteDir = args.remotePath ?? localDir;
        const isWin = process.platform === "win32" || (await remote.detectOs()).startsWith("win");
        const [local, remoteOut] = await Promise.all([
          hashLocalTree(localDir),
          remote.execCapture(buildRemoteHashCommand(remoteDir, isWin)),
        ]);
        const remoteTree = parseRemoteHashes(remoteOut.stdout, isWin);
        return { peer: peer.name, local: localDir, remote: remoteDir, entries: compareTrees(local, remoteTree) };
      } finally {
        remote.close();
      }
    }),
);

// ── act_pull ────────────────────────────────────────────────────────────────
server.tool(
  "act_pull",
  "Pull a file from a peer to this machine (SFTP over SSH, end-to-end encrypted).",
  {
    host: z.string(),
    file: z.string().describe("path of the file on the peer"),
    out: z.string().optional().describe("local dest dir (default: cwd)"),
  },
  async (args) =>
    safe(async () => {
      const { remote, peer } = await connect(args.host);
      try {
        const dest = path.resolve(args.out ?? process.cwd(), path.basename(args.file));
        await remote.sftpGet(args.file, dest);
        return { received: dest, bytes: statSync(dest).size, from: peer.name };
      } finally {
        remote.close();
      }
    }),
);

// ── act_send ────────────────────────────────────────────────────────────────
server.tool(
  "act_send",
  "Send a file from this machine to a peer (SFTP over SSH, encrypted). Lands in the peer's home dir.",
  {
    host: z.string(),
    file: z.string().describe("local file path"),
    to: z.string().optional().describe("dir on the peer (default: peer's home)"),
  },
  async (args) =>
    safe(async () => {
      const { remote, peer } = await connect(args.host);
      try {
        const localPath = path.resolve(args.file);
        const remoteDest = args.to ? path.posix.join(args.to, path.basename(localPath)) : path.basename(localPath);
        await remote.sftpPut(localPath, remoteDest);
        return { sent: path.basename(localPath), bytes: statSync(localPath).size, to: `${peer.name}:${remoteDest}` };
      } finally {
        remote.close();
      }
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

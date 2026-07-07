/**
 * `act mesh <host> "<message>"` — a persistent conversation thread with a peer's Claude.
 *
 * Unlike `act talk` (always a fresh one-shot task), `act mesh` remembers the
 * session id from the last message to this peer+thread and passes it via
 * `--resume`, so the peer's Claude recalls prior turns — no need to re-explain
 * context every message. Threads are keyed by (peer, --thread label) so you can
 * run several independent conversations with the same peer (e.g. "default" and
 * "refactor-review").
 *
 * `--new` drops the existing thread and starts fresh; `act mesh --list` shows
 * all open threads across peers.
 */
import { readFileSync } from "node:fs";
import chalk from "chalk";
import { requireConfig, saveConfig, upsertPeer } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { buildClaudeCommand } from "../core/claude-invocation.js";
import { parseClaudeResult } from "../core/claude-result.js";
import { loadSessions, saveSessions, getThread, upsertThread, dropThread, listThreads, DEFAULT_THREAD } from "../core/sessions.js";
import { log } from "../util/log.js";
import type { TalkOptions } from "../protocol/types.js";

export interface MeshOptions extends TalkOptions {
  thread?: string;
  new?: boolean;
}

export async function runMeshList(): Promise<void> {
  const sessions = loadSessions();
  const threads = listThreads(sessions);
  if (threads.length === 0) {
    log.warn("No mesh threads yet. Start one with `act mesh <host> \"<message>\"`.");
    return;
  }
  for (const { peer, label, thread } of threads) {
    const tag = label === DEFAULT_THREAD ? "" : chalk.dim(` [${label}]`);
    log.plain(
      `${chalk.bold(peer)}${tag}  ${chalk.dim(`${thread.turnCount} turns, last used ${thread.lastUsedAt}`)}`,
    );
    if (thread.lastSummary) log.plain(chalk.dim(`  “${thread.lastSummary}”`));
  }
}

export async function runMesh(host: string, message: string, opts: MeshOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) {
    throw new Error(`No peer matching "${host}" in config. Run \`act peers\` to list them.`);
  }
  if (!cfg.keyPairPath) throw new Error("No SSH key configured. Run `act init` to generate one.");

  const label = opts.thread ?? DEFAULT_THREAD;
  let sessions = loadSessions();
  if (opts.new) {
    sessions = dropThread(sessions, peer.name, label);
    saveSessions(sessions);
  }
  const existing = getThread(sessions, peer.name, label);

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  const claudePath = peer.claudePath ?? (await remote.detectClaudePath());
  if (claudePath !== peer.claudePath) {
    saveConfig(upsertPeer(cfg, { ...peer, claudePath }));
  }

  const project = opts.project ?? existing?.project ?? peer.defaultProject;
  const permissionMode = opts.permissionMode ?? "bypassPermissions";
  const cmd = buildClaudeCommand({
    ...opts,
    permissionMode,
    project,
    claudePath,
    task: message,
    outputFormat: "json",
    resumeSessionId: existing?.sessionId,
  });

  if (existing) {
    log.dim(`↺ resuming thread "${label}" with ${peer.name} (turn ${existing.turnCount + 1})`);
  } else {
    log.dim(`→ starting new thread "${label}" with ${peer.name}`);
  }

  const r = await remote.execCapture(cmd);
  remote.close();

  const summary = parseClaudeResult(r.stdout);
  if (!summary.sessionId) {
    // Nothing usable came back — surface the raw failure instead of silently
    // dropping the thread (a stale --resume id would break the next message).
    throw new Error(`No session id in peer response (exit ${r.code}): ${summary.answer || r.stderr}`);
  }

  const now = new Date().toISOString();
  const thread = {
    sessionId: summary.sessionId,
    project,
    createdAt: existing?.createdAt ?? now,
    lastUsedAt: now,
    turnCount: (existing?.turnCount ?? 0) + 1,
    lastSummary: summary.answer.slice(0, 140),
  };
  saveSessions(upsertThread(sessions, peer.name, label, thread));

  log.plain(summary.answer);
  if (summary.costUsd != null) {
    log.dim(`(${summary.turns} turn(s) this message, $${summary.costUsd.toFixed(4)})`);
  }
}

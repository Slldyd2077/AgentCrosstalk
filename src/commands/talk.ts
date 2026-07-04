/**
 * `act talk <host> "<task>"` — drive Claude Code headlessly on a peer.
 *
 * Resolves the peer from config, SSHes in (bootstrapping trust on first
 * contact), resolves `claude`'s path, runs `claude -p "<task>"` with the chosen
 * options, and streams stdout back. The peer's `claudePath` is cached so later
 * runs skip detection.
 *
 * The streamed output is whatever `--output-format` produces (default
 * stream-json → NDJSON events). A later milestone can parse and pretty-print it.
 */
import { readFileSync } from "node:fs";
import { requireConfig, saveConfig, upsertPeer } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { buildClaudeCommand } from "../core/claude-invocation.js";
import { log } from "../util/log.js";
import type { TalkOptions } from "../protocol/types.js";

export async function runTalk(host: string, task: string, opts: TalkOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) {
    throw new Error(
      `No peer matching "${host}" in config. Run \`act peers\` to list them, or \`act init\` to refresh from ZeroTier.`,
    );
  }
  if (!cfg.keyPairPath) {
    throw new Error("No SSH key configured. Run `act init` to generate one.");
  }

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  // Resolve claude on the peer; cache it on the peer record for next time.
  const claudePath = peer.claudePath ?? (await remote.detectClaudePath());
  if (claudePath !== peer.claudePath) {
    saveConfig(upsertPeer(cfg, { ...peer, claudePath }));
    log.dim(`Cached claude path on ${peer.name}: ${claudePath}`);
  }

  const project = opts.project ?? peer.defaultProject;
  // Headless Claude can't answer permission prompts, so default to bypass —
  // otherwise any task that touches files/bash hangs. Caller can override.
  const permissionMode = opts.permissionMode ?? "bypassPermissions";
  if (!opts.permissionMode) {
    log.dim("permission-mode: bypassPermissions (default) — the peer's Claude has full tool access.");
  }
  const cmd = buildClaudeCommand({ ...opts, permissionMode, project, claudePath, task });
  log.dim(`→ ${peer.user}@${peer.ip}`);

  const code = await remote.execStream(cmd);
  remote.close();
  if (code !== 0) process.exit(code);
}

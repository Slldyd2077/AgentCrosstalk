/**
 * `act status <host>` / `act status <host> --watch`
 *
 * Shows what the peer's Claude Code is currently doing: which project (from the
 * latest session transcript) and its recent messages/tool calls. `--watch`
 * refreshes every few seconds (like tail -f).
 */
import { readFileSync } from "node:fs";
import chalk from "chalk";
import { requireConfig } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { findLatestTranscript, summarizeTranscript, tailTranscript } from "../core/observe.js";
import { log } from "../util/log.js";

export interface StatusOptions {
  watch?: boolean;
  lines?: number;
}

export async function runStatus(host: string, opts: StatusOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) throw new Error(`No peer matching "${host}". Run \`act peers\` to list them.`);

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const lines = opts.lines ?? 25;
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  const poll = async () => {
    try {
      const found = await findLatestTranscript(remote);
      if (!found) {
        if (!opts.watch) log.warn("No Claude Code session transcripts found on the peer.");
        return;
      }
      const tail = await tailTranscript(remote, found.path, lines);
      const summary = summarizeTranscript(tail, found.project, found.path);
      if (opts.watch) process.stdout.write("\x1b[2J\x1b[H"); // clear screen between refreshes
      const stamp = new Date().toLocaleTimeString();
      log.plain(chalk.bold(`${peer.name}`) + chalk.dim(`  ·  ${stamp}  ·  项目: `) + chalk.cyan(summary.project));
      log.dim(summary.path);
      log.dim(`--- 最近 ${summary.entries.length} 条活动 ---`);
      for (const e of summary.entries) {
        const role = e.role === "assistant" ? chalk.green(e.role) : e.role === "user" ? chalk.blue(e.role) : chalk.dim(e.role);
        log.plain(`  ${role}: ${e.text}`);
      }
      if (opts.watch) log.dim("\n(refreshing every 5s — Ctrl+C to stop)");
    } catch (e) {
      log.error(`poll failed: ${(e as Error).message}`);
    }
  };

  await poll();
  if (opts.watch) {
    setInterval(poll, 5000);
    // setInterval keeps the process alive; remote stays open until Ctrl+C.
  } else {
    remote.close();
  }
}

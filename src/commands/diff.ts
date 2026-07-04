/**
 * `act diff <host>` — diff a project between this machine and a peer.
 *
 * Hashes the local tree and the peer's tree (one SSH command), compares, and
 * prints added / removed / modified. Works on non-git directories. The local
 * dir defaults to cwd; the remote dir defaults to the same path (use
 * --remote-path when the project lives at a different path on the peer).
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import chalk from "chalk";
import { requireConfig } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { buildRemoteHashCommand, compareTrees, hashLocalTree, parseRemoteHashes } from "../core/diff-engine.js";
import { log } from "../util/log.js";

export interface DiffOptions {
  /** Local project dir (default: cwd). */
  path?: string;
  /** Remote project dir (default: same resolved path as local). */
  remotePath?: string;
  json?: boolean;
}

export async function runDiff(host: string, opts: DiffOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) throw new Error(`No peer matching "${host}". Run \`act peers\` to list them.`);

  const localDir = path.resolve(opts.path ?? process.cwd());
  const remoteDir = opts.remotePath ?? localDir;

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  try {
    const isWin = peer.os?.toLowerCase().includes("win") || (await remote.detectOs()).startsWith("win");
    log.dim(`Hashing local ${localDir} and remote ${remoteDir}…`);

    const [local, remoteResult] = await Promise.all([
      hashLocalTree(localDir),
      remote.execCapture(buildRemoteHashCommand(remoteDir, isWin)),
    ]);
    const remoteTree = parseRemoteHashes(remoteResult.stdout, isWin);
    const entries = compareTrees(local, remoteTree);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ peer: peer.name, local: localDir, remote: remoteDir, entries }) + "\n");
      return;
    }

    if (entries.length === 0) {
      log.success(`No differences vs ${peer.name}.`);
      return;
    }

    const group = (status: string) => entries.filter((e) => e.status === status);
    const modified = group("modified");
    const added = group("added");
    const removed = group("removed");

    if (modified.length) {
      log.plain(chalk.yellow(`Modified (${modified.length}):`));
      modified.forEach((e) => log.plain(chalk.yellow("  ~ ") + e.path));
    }
    if (added.length) {
      log.plain(chalk.green(`Only here (${added.length}):`));
      added.forEach((e) => log.plain(chalk.green("  + ") + e.path));
    }
    if (removed.length) {
      log.plain(chalk.red(`Only on ${peer.name} (${removed.length}):`));
      removed.forEach((e) => log.plain(chalk.red("  - ") + e.path));
    }
    log.dim(`${local.size} local / ${remoteTree.size} remote files compared.`);
  } finally {
    remote.close();
  }
}

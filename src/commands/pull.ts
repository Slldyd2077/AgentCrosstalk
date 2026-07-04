/**
 * `act pull <file> from <host>` — pull a file from a peer.
 *
 * Uses SFTP over the existing SSH channel (direct P2P over the overlay, fully
 * encrypted — no relay, no cloud). `<file>` is a path on the peer; it lands in
 * the local cwd (or --out) under the same basename.
 */
import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import { requireConfig } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { log } from "../util/log.js";

export interface PullOptions {
  /** Local destination dir (default: cwd). */
  out?: string;
}

export async function runPull(file: string, host: string, opts: PullOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) throw new Error(`No peer matching "${host}". Run \`act peers\` to list them.`);

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  const localDest = path.resolve(opts.out ?? process.cwd(), path.basename(file));
  log.dim(`Pulling ${file} from ${peer.name} → ${localDest}…`);
  try {
    await remote.sftpGet(file, localDest);
    const bytes = statSync(localDest).size;
    log.success(`Received ${path.basename(file)} (${bytes} bytes) → ${localDest}`);
  } finally {
    remote.close();
  }
}

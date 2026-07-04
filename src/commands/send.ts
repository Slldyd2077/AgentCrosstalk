/**
 * `act send <file> to <host>` — push a file to a peer.
 *
 * Uses SFTP over the existing SSH channel (direct P2P over the overlay, fully
 * encrypted — no relay, no cloud). `<file>` is a local path; it lands in the
 * peer's home directory under the same basename.
 */
import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import { requireConfig } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { log } from "../util/log.js";

export interface SendOptions {
  /** Receive dir on the peer (default: peer's home). */
  to?: string;
}

export async function runSend(file: string, host: string, opts: SendOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) throw new Error(`No peer matching "${host}". Run \`act peers\` to list them.`);

  const localPath = path.resolve(file);
  const bytes = statSync(localPath).size;

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });

  // Relative remote path resolves to the peer's SFTP home; --to overrides.
  const remoteDest = opts.to ? path.posix.join(opts.to, path.basename(localPath)) : path.basename(localPath);
  log.dim(`Sending ${localPath} (${bytes} bytes) → ${peer.name}:${remoteDest}…`);
  try {
    await remote.sftpPut(localPath, remoteDest);
    log.success(`Sent ${path.basename(localPath)} to ${peer.name}.`);
  } finally {
    remote.close();
  }
}

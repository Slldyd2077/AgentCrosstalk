/**
 * `act clone <host> <path>` — clone a project directory from a peer.
 *
 * Detects the path kind on the peer and dispatches: git repo → git-bundle pull
 * (history + all branches + auto-skipped gitignored junk); non-git dir → tar;
 * file → points you to `act pull`; missing → error.
 */
import { readFileSync } from "node:fs";
import { requireConfig } from "../core/config.js";
import { findPeer } from "../core/peers.js";
import { Remote } from "../core/remote.js";
import { detectRemotePathKind, gitBundlePull, tarPull } from "../core/clone.js";

export interface CloneOptions {
  out?: string;
  noEnv?: boolean;
}

export async function runClone(host: string, remotePath: string, opts: CloneOptions = {}): Promise<void> {
  const cfg = requireConfig();
  const peer = findPeer(cfg.peers, host);
  if (!peer) throw new Error(`No peer matching "${host}". Run \`act peers\` to list them.`);

  const publicKey = readFileSync(`${cfg.keyPairPath}.pub`, "utf8").trim();
  const remote = await Remote.connect(peer, { keyPath: cfg.keyPairPath, publicKey, sshPort: cfg.sshPort });
  try {
    const kind = await detectRemotePathKind(remote, remotePath);
    if (kind === "none") throw new Error(`Not found on ${peer.name}: ${remotePath}`);
    if (kind === "file") {
      throw new Error(`${remotePath} is a file — use \`act pull ${remotePath} from ${host}\` for single files.`);
    }
    if (kind === "git-dir") {
      await gitBundlePull(remote, remotePath, opts);
      return;
    }
    await tarPull(remote, remotePath, opts);
  } finally {
    remote.close();
  }
}

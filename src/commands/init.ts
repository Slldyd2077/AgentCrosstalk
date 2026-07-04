/**
 * `act init` — one-shot per-machine setup.
 *
 * Local steps:
 *   1. Ensure the OpenSSH server is running (so peers can SSH in).
 *   2. Generate an ed25519 keypair (so this machine can SSH out).
 *   3. Connect to ZeroTier Central (token + network) and fetch members.
 *   4. Detect this machine's own member entry (by matching a local interface IP).
 *   5. Check that `claude` and `croc` are installed (warn + instruct if not).
 *   6. Write config.json (token stored here, in user-local config, outside the repo).
 *
 * Cross-machine trust (pushing this machine's pubkey onto a peer) is established
 * lazily on first `act talk`/`diff`/`pull` — see `core/remote.ts` (M2).
 */
import os, { networkInterfaces } from "node:os";
import path from "node:path";
import { log } from "../util/log.js";
import { isAvailable, which } from "../util/exec.js";
import { ensureSshd } from "../util/openssh-setup.js";
import { ensureKeyPair } from "../util/ssh-keys.js";
import { listMembers, listNetworks, DEFAULT_ZEROTIER_API_BASE } from "../util/zerotier.js";
import { getConfigDir, getKeyPairDir, loadConfig, newConfig, saveConfig, upsertPeer } from "../core/config.js";
import type { Peer } from "../protocol/types.js";

export interface InitOptions {
  force?: boolean;
  /** ZeroTier Central API token (read-only). Falls back to $ZEROTIER_API_TOKEN. */
  zerotierToken?: string;
  /** ZeroTier network id. Auto-picked if you have exactly one network. */
  zerotierNetwork?: string;
}

const DEFAULT_KEY_NAME = "id_act";

function localIpv4Set(): Set<string> {
  const s = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    if (!list) continue;
    for (const ni of list) {
      if (ni && !ni.internal && ni.family === "IPv4") s.add(ni.address);
    }
  }
  return s;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  log.info("Running act init…");

  // 1. OpenSSH server (so peers can SSH in). Non-fatal: an initiator-only
  //    machine can skip this and still drive others.
  try {
    await ensureSshd();
  } catch (e) {
    log.warn(`Could not enable the OpenSSH server on this machine: ${(e as Error).message}`);
    log.dim("Outgoing use (driving other machines) still works; this machine just can't be driven until sshd is enabled (run `act init` elevated).");
  }

  // 2. Keypair (regenerate only with --force).
  const privateKeyPath = path.join(getKeyPairDir(), DEFAULT_KEY_NAME);
  if (opts.force) log.dim("--force: regenerating the SSH keypair.");
  const key = await ensureKeyPair(privateKeyPath);
  log.success(`SSH keypair ready at ${key.privatePath}`);

  // 3. ZeroTier Central: resolve token + network, fetch members.
  //    Reuse values already in config (e.g. from a prior run) if no flag given.
  const existing = loadConfig();
  const token = opts.zerotierToken ?? process.env.ZEROTIER_API_TOKEN ?? existing?.zerotier?.token;
  if (!token) {
    throw new Error(
      "No ZeroTier API token. Pass --zerotier-token <TOKEN> or set ZEROTIER_API_TOKEN.\n" +
        "Generate a read-only token at my.zerotier.com → Account → API Access Tokens.",
    );
  }

  let networkId = opts.zerotierNetwork ?? existing?.zerotier?.networkId;
  if (!networkId) {
    const networks = await listNetworks(token);
    if (networks.length === 0) {
      throw new Error("Your ZeroTier account has no networks. Create one at my.zerotier.com first.");
    }
    if (networks.length === 1) {
      networkId = networks[0]!.id;
      log.dim(`Auto-selected network ${networkId} (${networks[0]!.name || "unnamed"}).`);
    } else {
      const list = networks.map((n) => `  ${n.id}  ${n.name || "(unnamed)"}`).join("\n");
      throw new Error(`You have multiple ZeroTier networks — pick one with --zerotier-network <id>:\n${list}`);
    }
  }

  const members = await listMembers(token, networkId);
  log.success(`ZeroTier network ${networkId}: ${members.length} member(s) with an IP.`);

  // 4. Detect self by matching a local interface IP.
  const localIps = localIpv4Set();
  const selfMember = members.find((m) => localIps.has(m.ip));
  if (selfMember) {
    log.success(`This machine is ${selfMember.name || "(unnamed)"} (${selfMember.ip}).`);
  } else {
    log.warn("Couldn't auto-detect this machine among ZeroTier members (is ZeroTier running here?).");
  }

  // 5. Prerequisite checks (this machine must serve `claude` + `croc` to peers).
  await checkPrereq("claude");
  await checkPrereq("croc");

  // 6. Build / merge config.
  const cfg = existing ?? newConfig(key.privatePath);
  cfg.keyPairPath = key.privatePath;
  cfg.zerotier = { apiBase: DEFAULT_ZEROTIER_API_BASE, token, networkId };
  if (selfMember) {
    cfg.self = { hostname: selfMember.name || os.hostname(), ip: selfMember.ip };
  }

  const defaultUser = os.userInfo().username;
  for (const m of members) {
    if (selfMember && m.nodeId === selfMember.nodeId) continue; // don't list self as a target
    const peer: Peer = {
      name: m.name || m.nodeId,
      ip: m.ip,
      user: defaultUser,
      port: cfg.sshPort,
      nodeId: m.nodeId,
      os: m.os,
    };
    cfg.peers = upsertPeer(cfg, peer).peers;
  }

  saveConfig(cfg);
  log.success(`Config written to ${path.join(getConfigDir(), "config.json")}.`);
  log.info(`Peers recorded: ${cfg.peers.length}. Run \`act peers\` to list them.`);
  log.dim("Next: `act talk <name|ip> \"<task>\"` to drive a peer's Claude.");
}

async function checkPrereq(name: string): Promise<void> {
  if (await isAvailable(name)) {
    const p = await which(name);
    log.success(`${name} found${p ? ` at ${p}` : ""}.`);
  } else {
    const hint =
      name === "claude"
        ? "Install Claude Code and run `claude` once to log in (or set ANTHROPIC_API_KEY)."
        : "Windows: `winget install schollz.croc`. macOS: `brew install croc`.";
    log.warn(`${name} not found on PATH — this machine can't be driven for ${name} until installed.`);
    log.dim(hint);
  }
}

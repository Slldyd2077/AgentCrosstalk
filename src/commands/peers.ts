/**
 * `act peers` — list machines on the ZeroTier network (live).
 *
 * Fetches members fresh from ZeroTier Central using the token/network stored by
 * `act init`, marks this machine, and prints a table. `--json` emits a
 * machine-readable array (used by the MCP server).
 */
import os from "node:os";
import chalk from "chalk";
import { networkInterfaces } from "node:os";
import { requireConfig } from "../core/config.js";
import { listMembers } from "../util/zerotier.js";
import { log } from "../util/log.js";

export interface PeersOptions {
  json?: boolean;
}

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

/** Format a `lastOnline` ms-epoch as a relative "seen Xs/min/h ago" string. */
function seenAgo(lastOnline: number | undefined, now = Date.now()): string | null {
  if (!lastOnline) return null;
  const sec = Math.max(0, Math.round((now - lastOnline) / 1000));
  if (sec < 60) return `seen ${sec}s ago`;
  if (sec < 3600) return `seen ${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `seen ${Math.round(sec / 3600)}h ago`;
  return `seen ${Math.round(sec / 86400)}d ago`;
}

export async function runPeers(opts: PeersOptions = {}): Promise<void> {
  const cfg = requireConfig();
  if (!cfg.zerotier) {
    throw new Error("No ZeroTier config. Run `act init` first (with --zerotier-token).");
  }
  const members = await listMembers(cfg.zerotier.token, cfg.zerotier.networkId, cfg.zerotier.apiBase);
  const localIps = localIpv4Set();

  if (opts.json) {
    process.stdout.write(JSON.stringify({ members }) + "\n");
    return;
  }

  const selfMember = members.find((m) => localIps.has(m.ip));
  for (const m of members) {
    const isSelf = m.ip === selfMember?.ip;
    const marker = isSelf ? chalk.bold.green("★") : " ";
    const name = chalk.bold(m.name || chalk.dim(m.nodeId));
    const osTag = m.os ? chalk.dim(`  [${m.os}]`) : "";
    const seen = seenAgo(m.lastOnline) ? chalk.dim(`  ${seenAgo(m.lastOnline)}`) : "";
    const selfTag = isSelf ? chalk.dim("  (this machine)") : "";
    log.plain(`${marker} ${name}  ${m.ip}${osTag}${seen}${selfTag}`);
  }
  if (members.length === 0) {
    log.warn("No members with an IP found on this network.");
  }
}

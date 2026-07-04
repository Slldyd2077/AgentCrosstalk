/**
 * Shared types for `act` (AgentCrosstalk).
 *
 * These describe the on-disk config shape and the values that flow between the
 * CLI commands, the networking/SSH/croc helpers, and the MCP server.
 */

/** Remote shell family detected on a peer — drives how commands are quoted. */
export type ShellKind = "pwsh" | "bash" | "cmd" | "unknown";

/** A discovered / configured remote machine. Network-agnostic (ZeroTier or Tailscale). */
export interface Peer {
  /** Human-friendly name (ZeroTier member name, or a Tailscale hostname). */
  name: string;
  /** Network address to connect to (ZeroTier managed IP, or a Tailscale IP). */
  ip: string;
  /** SSH username on the peer. */
  user: string;
  /** SSH port (default 22). */
  port: number;
  /** ZeroTier member node id (10-hex); absent for Tailscale. */
  nodeId?: string;
  /** MagicDNS name (Tailscale only). */
  dnsName?: string;
  /** Peer OS (`windows` / `linux` / `macos` / …). */
  os?: string;
  /** Cached absolute path to `claude` on the peer (avoids PATH issues over SSH). */
  claudePath?: string;
  /** Detected default shell on the peer. */
  defaultShell?: ShellKind;
  /** Optional default project dir to run `act talk` in. */
  defaultProject?: string;
}

/** ZeroTier Central API configuration (stored in local user config, outside the repo). */
export interface ZerotierConfig {
  apiBase: string; // e.g. https://api.zerotier.com/api/v1
  token: string; // read-only Central API token
  networkId: string; // 16-hex network id
}

/** croc relay configuration (self-hosted on the overlay for "no cloud"). */
export interface CrocRelay {
  host: string;
  ports: string;
}

/** The persisted `config.json`. */
export interface Config {
  schemaVersion: number;
  /** Path to the ed25519 private key `act` uses for SSH. */
  keyPairPath: string;
  /** Known peers (refreshed from ZeroTier on `act init`). */
  peers: Peer[];
  /** ZeroTier Central connection (token + network). */
  zerotier?: ZerotierConfig;
  /** croc relay address used by `act send` / `act pull`. */
  relay?: CrocRelay;
  /** Default SSH port. */
  sshPort: number;
  /** This machine's identity on the overlay (best-effort). */
  self?: {
    hostname: string;
    ip: string;
  };
}

/** One entry in a cross-machine diff. */
export interface DiffEntry {
  path: string;
  status: "added" | "removed" | "modified";
}

/** Options accepted by `act talk`. */
export interface TalkOptions {
  project?: string;
  model?: string;
  maxTurns?: number;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  allowedTools?: string[];
  outputFormat?: "text" | "json" | "stream-json";
}

export const CONFIG_SCHEMA_VERSION = 1;

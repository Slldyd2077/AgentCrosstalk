/**
 * Config persistence.
 *
 * `config.json` lives in the platform-correct config dir (via `env-paths`, no
 * `-nodejs` suffix). The ed25519 SSH keypair lives under the data dir. Writes
 * are atomic (tmp + rename). The schema is zod-validated on read and write so a
 * malformed hand-edit fails loudly with a clear error instead of corrupting
 * state deeper in the stack.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import envPaths from "env-paths";
import { z } from "zod";
import { CONFIG_SCHEMA_VERSION, type Config, type Peer } from "../protocol/types.js";

const paths = envPaths("act", { suffix: "" });
const CONFIG_DIR = paths.config;
const DATA_DIR = paths.data;
const CONFIG_FILENAME = "config.json";

const ShellKindSchema = z.enum(["pwsh", "bash", "cmd", "unknown"]);

const PeerSchema = z.object({
  name: z.string(),
  ip: z.string(),
  user: z.string(),
  port: z.number().int().positive(),
  nodeId: z.string().optional(),
  dnsName: z.string().optional(),
  os: z.string().optional(),
  claudePath: z.string().optional(),
  defaultShell: ShellKindSchema.optional(),
  defaultProject: z.string().optional(),
});

const ZerotierSchema = z.object({
  apiBase: z.string(),
  token: z.string(),
  networkId: z.string(),
});

const ConfigSchema = z.object({
  schemaVersion: z.number(),
  keyPairPath: z.string(),
  peers: z.array(PeerSchema),
  zerotier: ZerotierSchema.optional(),
  relay: z.object({ host: z.string(), ports: z.string() }).optional(),
  sshPort: z.number().int().positive(),
  self: z
    .object({
      hostname: z.string(),
      ip: z.string(),
    })
    .optional(),
});

export function getConfigDir(): string {
  return CONFIG_DIR;
}
export function getDataDir(): string {
  return DATA_DIR;
}
export function getKeyPairDir(): string {
  return path.join(DATA_DIR, "ssh");
}
export function defaultConfigPath(): string {
  return path.join(CONFIG_DIR, CONFIG_FILENAME);
}

/** Load config from `file` (default: the standard path). Returns null if absent. */
export function loadConfig(file: string = defaultConfigPath()): Config | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`act config at ${file} is not valid JSON: ${(e as Error).message}`);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`act config at ${file} failed validation: ${result.error.message}`);
  }
  return result.data as Config;
}

/** Load config, throwing a friendly "run act init" error if absent. */
export function requireConfig(file: string = defaultConfigPath()): Config {
  const cfg = loadConfig(file);
  if (!cfg) {
    throw new Error(`No act config found at ${file}. Run \`act init\` first.`);
  }
  return cfg;
}

/** Atomically write config to `file` (default: the standard path). */
export function saveConfig(cfg: Config, file: string = defaultConfigPath()): void {
  const validated = ConfigSchema.parse(cfg);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** Upsert a peer by name; returns a new config (immutable). */
export function upsertPeer(cfg: Config, peer: Peer): Config {
  const peers = cfg.peers.filter((p) => p.name !== peer.name);
  peers.push(peer);
  return { ...cfg, peers };
}

/** Create an empty config骨架 for a freshly-initialized machine. */
export function newConfig(keyPairPath: string, sshPort = 22): Config {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    keyPairPath,
    peers: [],
    sshPort,
  };
}

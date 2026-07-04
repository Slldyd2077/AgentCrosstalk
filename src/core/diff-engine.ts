/**
 * Cross-machine file-tree diff.
 *
 * Both sides hash every file with SHA-256 and we compare relpath→hash maps:
 * same path + different hash = modified; local-only = added; remote-only =
 * removed. SHA-256 is used (not BLAKE3) because it's available natively on the
 * remote (sha256sum / Get-FileHash) — the algorithm MUST match on both sides or
 * identical files would look "modified".
 *
 * The remote side is hashed with a SINGLE ssh command that prints
 * `<sha256>  <path>` per file; we parse + filter ignores locally. Pure parsers
 * (`parseRemoteHashes`, `compareTrees`) are unit-tested without an SSH session.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { DiffEntry } from "../protocol/types.js";

export const DEFAULT_IGNORES = ["node_modules/**", ".git/**"];

function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function shQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** SHA-256 of a single file (streaming). */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(file);
    s.on("data", (d: string | Buffer) => h.update(d));
    s.on("error", reject);
    s.on("end", () => resolve(h.digest("hex")));
  });
}

/** Walk `dir` and return relpath→hash (forward-slash relpaths, ignores applied). */
export async function hashLocalTree(dir: string, ignores: string[] = DEFAULT_IGNORES): Promise<Map<string, string>> {
  const files = await fg("**/*", { cwd: dir, ignore: ignores, onlyFiles: true, dot: true });
  const out = new Map<string, string>();
  await Promise.all(
    files.map(async (f) => {
      const rel = f.replace(/\\/g, "/");
      if (!ignored(rel, ignores)) out.set(rel, await hashFile(path.join(dir, f)));
    }),
  );
  return out;
}

/** Build the one-shot remote command that prints `<sha256>  <relpath>` per file. */
export function buildRemoteHashCommand(dir: string, isWindows: boolean): string {
  if (isWindows) {
    const d = psQuote(dir);
    return `$b=${d}; Get-ChildItem -LiteralPath $b -Recurse -File -Force | ForEach-Object { $h=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash; $r=$_.FullName.Substring($b.Length); "$h  $r" }`;
  }
  return `cd ${shQuote(dir)} && find . -type f -print0 | xargs -0 sha256sum`;
}

/** True if any path segment matches a default-ignore bucket (node_modules / .git). */
function ignored(rel: string, ignores: string[]): boolean {
  const banned = ignores.map((p) => p.replace(/[/*]+$/g, ""));
  const segs = rel.split("/");
  return segs.some((s) => banned.includes(s));
}

/** Parse `<sha256>  <path>` lines (from the remote command) into a relpath→hash map. */
export function parseRemoteHashes(stdout: string, isWindows: boolean, ignores: string[] = DEFAULT_IGNORES): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const hash = line.slice(0, 64).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) continue;
    const raw = line.slice(64).trim();
    let rel = isWindows ? raw.replace(/\\/g, "/") : raw.replace(/^\.\//, "");
    rel = rel.replace(/^\/+/, "");
    if (ignored(rel, ignores)) continue;
    out.set(rel, hash);
  }
  return out;
}

/** Compare local vs remote → added / removed / modified. Pure. */
export function compareTrees(local: Map<string, string>, remote: Map<string, string>): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const [p, h] of local) {
    if (!remote.has(p)) entries.push({ path: p, status: "added" });
    else if (remote.get(p) !== h) entries.push({ path: p, status: "modified" });
  }
  for (const [p] of remote) {
    if (!local.has(p)) entries.push({ path: p, status: "removed" });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

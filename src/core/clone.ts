/**
 * `act clone <host> <path>` — migrate a project from a peer to this machine.
 *
 * Git repos use `git bundle --all`: tracked files + full history, and gitignored
 * junk (node_modules / dist / .env / build artifacts) is excluded automatically —
 * no fragile tar --exclude globbing. Non-git dirs fall back to tar with default
 * excludes. All of the peer's branches become local branches; the peer's `.env`
 * (gitignored) is pulled too so the project runs, unless --no-env.
 *
 * (The dir flow targets Windows peers / PowerShell for now; single-file
 * `act pull` stays cross-platform SFTP.)
 */
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture } from "../util/exec.js";
import { psSingleQuote } from "./claude-invocation.js";
import { log } from "../util/log.js";
import type { Remote } from "./remote.js";

export type RemotePathKind = "file" | "git-dir" | "plain-dir" | "none";

export const DEFAULT_TAR_EXCLUDES = [
  "*node_modules*", "*dist*", "*build*", "*.next", "*target*", "*__pycache__*", "*.venv*", "*venv*",
];

/** Map the peer's detection output to a path kind. Pure (testable). */
export function parsePathKind(stdout: string): RemotePathKind {
  const s = stdout.trim();
  if (s === "git-dir" || s === "plain-dir" || s === "file") return s;
  return "none";
}

/** `git bundle create --branches --tags` command (pure, testable).
 *  Uses --branches --tags (not --all) so the peer's remote-tracking refs don't
 *  pollute the clone as a stray "origin" branch. */
export function buildBundleCommand(remotePath: string, peerBundle: string): string {
  return `git -C ${psSingleQuote(remotePath)} bundle create ${psSingleQuote(peerBundle)} --branches --tags`;
}

/** tar command for non-git dirs (pure, testable). */
export function buildTarCommand(
  parent: string,
  name: string,
  peerArchive: string,
  excludeGlobs: string[],
  gzip: boolean,
): string {
  const exc = excludeGlobs.map((g) => `--exclude=${psSingleQuote(g)}`).join(" ");
  const flag = gzip ? "-czf" : "-acf";
  return `tar ${flag} ${psSingleQuote(peerArchive)} ${exc} -C ${psSingleQuote(parent)} ${psSingleQuote(name)}`;
}

async function peerHome(remote: Remote): Promise<{ home: string; isWin: boolean }> {
  const isWin = (await remote.detectOs()).startsWith("win");
  const q = isWin ? "Write-Output $env:USERPROFILE" : "echo $HOME";
  return { home: (await remote.execCapture(q)).stdout.trim(), isWin };
}

function joinRemote(parent: string, child: string, isWin: boolean): string {
  return isWin ? `${parent}\\${child}` : `${parent}/${child}`;
}

export async function detectRemotePathKind(remote: Remote, remotePath: string): Promise<RemotePathKind> {
  // PowerShell (Windows peer). TODO: posix peer branch.
  const cmd = `$p=${psSingleQuote(remotePath)}
if (Test-Path $p -PathType Container) {
  if ((git -C $p rev-parse --is-inside-work-tree 2>$null) -eq 'true') { 'git-dir' } else { 'plain-dir' }
} elseif (Test-Path $p -PathType Leaf) { 'file' } else { 'none' }`;
  return parsePathKind((await remote.execCapture(cmd)).stdout);
}

export interface CloneOptions {
  out?: string;
  noEnv?: boolean;
}

/** Turn all `origin/*` remote-tracking refs into local branches, then drop the temp origin. */
async function localizeBranches(localDir: string): Promise<void> {
  const refs = await runCapture("git", ["-C", localDir, "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]);
  for (const ref of refs.stdout.split(/\r?\n/).filter(Boolean)) {
    if (ref === "origin/HEAD") continue;
    const branch = ref.replace(/^origin\//, "");
    // The checked-out branch already exists locally → ignore the error.
    await runCapture("git", ["-C", localDir, "branch", "--track", branch, ref], { rejectOnError: false });
  }
  await runCapture("git", ["-C", localDir, "remote", "remove", "origin"], { rejectOnError: false });
}

async function pullEnvIfPresent(remote: Remote, remotePath: string, localDir: string, isWin: boolean): Promise<void> {
  const envRemote = joinRemote(remotePath, ".env", isWin);
  const ec = await remote.execCapture(
    `if (Test-Path ${psSingleQuote(envRemote)} -PathType Leaf) { 'True' } else { 'False' }`,
  );
  if (ec.stdout.trim() === "True") {
    await remote.sftpGet(envRemote, path.join(localDir, ".env"));
    log.dim("Pulled .env (gitignored, needed to run).");
  }
}

/** Pull a git project via git bundle. Returns the local dir. */
export async function gitBundlePull(remote: Remote, remotePath: string, opts: CloneOptions = {}): Promise<string> {
  const name = path.basename(remotePath);
  const localDir = path.resolve(opts.out ?? process.cwd(), name);
  if (existsSync(localDir)) throw new Error(`Destination already exists: ${localDir}`);

  const { home, isWin } = await peerHome(remote);
  const peerBundle = joinRemote(home, "act-clone.bundle", isWin);

  log.dim(`Bundling ${remotePath} on peer (git)…`);
  const b = await remote.execCapture(buildBundleCommand(remotePath, peerBundle));
  if (b.code !== 0) {
    await remote.execCapture(`Remove-Item ${psSingleQuote(peerBundle)} -Force -ErrorAction SilentlyContinue`);
    throw new Error(`git bundle failed on peer: ${b.stderr || b.stdout}`);
  }

  const localBundle = path.join(os.tmpdir(), "act-clone.bundle");
  await remote.sftpGet(peerBundle, localBundle);
  await remote.execCapture(`Remove-Item ${psSingleQuote(peerBundle)} -Force -ErrorAction SilentlyContinue`);

  log.dim(`Cloning into ${localDir}…`);
  const clone = await runCapture("git", ["clone", localBundle, localDir]);
  if (clone.exitCode !== 0) {
    try { unlinkSync(localBundle); } catch { /* ignore */ }
    throw new Error(`git clone failed: ${clone.stderr}`);
  }
  await localizeBranches(localDir);
  try { unlinkSync(localBundle); } catch { /* ignore */ }

  if (!opts.noEnv) await pullEnvIfPresent(remote, remotePath, localDir, isWin);

  log.success(`Cloned ${name} → ${localDir}`);
  log.dim(`Next: cd ${localDir} && npm install`);
  return localDir;
}

/** Pull a non-git dir via tar (best-effort excludes). Returns the local dir. */
export async function tarPull(remote: Remote, remotePath: string, opts: CloneOptions = {}): Promise<string> {
  const name = path.basename(remotePath);
  const parentDir = path.dirname(remotePath);
  const outDir = path.resolve(opts.out ?? process.cwd());
  const localDir = path.join(outDir, name);
  if (existsSync(localDir)) throw new Error(`Destination already exists: ${localDir}`);

  const { home, isWin } = await peerHome(remote);
  const ext = isWin ? "zip" : "tar.gz";
  const peerArchive = joinRemote(home, `act-clone.${ext}`, isWin);

  log.dim(`Archiving ${remotePath} on peer (non-git)…`);
  const t = await remote.execCapture(buildTarCommand(parentDir, name, peerArchive, DEFAULT_TAR_EXCLUDES, !isWin));
  if (t.code !== 0) {
    await remote.execCapture(`Remove-Item ${psSingleQuote(peerArchive)} -Force -ErrorAction SilentlyContinue`);
    throw new Error(`tar failed on peer: ${t.stderr}`);
  }

  const localArchive = path.join(os.tmpdir(), `act-clone.${ext}`);
  await remote.sftpGet(peerArchive, localArchive);
  await remote.execCapture(`Remove-Item ${psSingleQuote(peerArchive)} -Force -ErrorAction SilentlyContinue`);

  mkdirSync(outDir, { recursive: true });
  const extract =
    ext === "zip"
      ? await runCapture("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${localArchive}' -DestinationPath '${outDir}' -Force`])
      : await runCapture("tar", ["-xzf", localArchive, "-C", outDir]);
  try { unlinkSync(localArchive); } catch { /* ignore */ }
  if (extract.exitCode !== 0) throw new Error(`extract failed: ${extract.stderr}`);

  log.success(`Pulled ${name} → ${localDir} (non-git)`);
  return localDir;
}

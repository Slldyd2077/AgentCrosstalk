/**
 * Thin process-execution wrappers.
 *
 * `runCapture` uses `execa`, which resolves binaries via PATH (+ PATHEXT on
 * Windows, so `tailscale` finds `tailscale.exe`) and returns a structured
 * result without throwing on non-zero exit when `rejectOnError` is false.
 *
 * `runStream` inherits stdio — used by `act send`/`act pull` to surface croc's
 * progress live.
 */
import { spawn } from "node:child_process";
import { execa } from "execa";

export interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Throw on non-zero exit (default true). ENOENT always throws. */
  rejectOnError?: boolean;
  /** Stdin contents. */
  input?: string;
}

/** Run a command, capture stdout/stderr. Throws on non-zero exit unless `rejectOnError: false`. */
export async function runCapture(command: string, args: string[], opts: RunOptions = {}): Promise<CaptureResult> {
  const result = await execa(command, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    input: opts.input,
    reject: false,
    windowsHide: true,
  });
  const exitCode = result.exitCode ?? -1;
  if (exitCode !== 0 && opts.rejectOnError !== false) {
    throw new Error(
      `Command failed (exit ${exitCode}): ${command} ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), exitCode };
}

/** Run a command with inherited stdio (live output). Resolves with the exit code. */
export function runStream(command: string, args: string[], opts: RunOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });
}

/** Resolve a binary's full path (`where` on Windows, `which` elsewhere). Null if not found. */
export async function which(command: string): Promise<string | null> {
  const tool = process.platform === "win32" ? "where" : "which";
  try {
    const r = await runCapture(tool, [command], { rejectOnError: false });
    if (r.exitCode !== 0) return null;
    return r.stdout.split(/\r?\n/)[0] ?? null;
  } catch {
    return null;
  }
}

/** Quick check: does `command --version` succeed? */
export async function isAvailable(command: string, versionFlag = "--version"): Promise<boolean> {
  try {
    const r = await runCapture(command, [versionFlag], { rejectOnError: false });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

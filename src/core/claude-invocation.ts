/**
 * Build the remote shell command that runs Claude Code headlessly on a peer.
 *
 * Targets PowerShell (the DefaultShell `act init` sets on Windows peers), since
 * that's where `claude` is reliably on PATH. The task and paths are
 * single-quoted PowerShell strings with embedded quotes doubled — enough for
 * typical tasks. (Exotic control characters in a task would need stdin piping,
 * left for later.)
 *
 * Pure string-building so it can be unit-tested without an SSH session.
 */
import type { TalkOptions } from "../protocol/types.js";

export interface ClaudeCommandOptions extends TalkOptions {
  /** Resolved absolute path to `claude` on the peer (avoids PATH issues over SSH). */
  claudePath: string;
  /** The task to run. */
  task: string;
}

/** Wrap a string as a PowerShell single-quoted literal (doubles embedded quotes). */
export function psSingleQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

/** Build the PowerShell command string to run headless Claude on the peer. */
export function buildClaudeCommand(opts: ClaudeCommandOptions): string {
  const parts: string[] = [];

  if (opts.project) {
    parts.push(`cd ${psSingleQuote(opts.project)}`);
  }

  const args: string[] = ["-p", psSingleQuote(opts.task)];
  args.push("--output-format", psSingleQuote(opts.outputFormat ?? "stream-json"));
  if (opts.project) args.push("--add-dir", psSingleQuote(opts.project));
  if (opts.model) args.push("--model", psSingleQuote(opts.model));
  if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));
  if (opts.permissionMode) args.push("--permission-mode", psSingleQuote(opts.permissionMode));
  if (opts.allowedTools && opts.allowedTools.length > 0) {
    args.push("--allowedTools", psSingleQuote(opts.allowedTools.join(",")));
  }

  // `&` (call operator) handles quoted paths and bare names alike.
  parts.push(`& ${psSingleQuote(opts.claudePath)} ${args.join(" ")}`);
  return parts.join("; ");
}

/**
 * Console logger with a `--json` mode toggle.
 *
 * Most commands stream human-readable output. When `act` is driven by an MCP
 * server (or a user passes `--json`), structured output is preferable — flip
 * `setJsonMode(true)` and the helpers stay quiet while commands write their own
 * JSON to stdout.
 */
import chalk from "chalk";

let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Write only in human mode. */
function human(line: string): void {
  if (!jsonMode) process.stderr.write(line + "\n");
}

export const log = {
  info: (msg: string): void => human(chalk.cyan("• ") + msg),
  success: (msg: string): void => human(chalk.green("✓ ") + msg),
  warn: (msg: string): void => human(chalk.yellow("! ") + msg),
  error: (msg: string): void => human(chalk.red("✗ ") + msg),
  dim: (msg: string): void => human(chalk.dim(msg)),
  /** Raw line, human mode only — used for streamed command output. */
  raw: (msg: string): void => {
    if (!jsonMode) process.stdout.write(msg);
  },
  /** Always printed regardless of mode (fatal errors / final result URIs). */
  plain: (msg: string): void => {
    process.stdout.write(msg + "\n");
  },
};

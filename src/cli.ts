/**
 * `act` CLI entrypoint (`act` bin).
 *
 * Wires the commander program with all MVP subcommands. Command *logic* lives
 * in `src/commands/*` and is filled in milestone-by-milestone (M1–M4); this file
 * is only the surface.
 */
import { Command } from "commander";
import { runInit, type InitOptions } from "./commands/init.js";
import { runPeers } from "./commands/peers.js";
import { runTalk } from "./commands/talk.js";
import { runDiff } from "./commands/diff.js";
import { runSend } from "./commands/send.js";
import { runPull } from "./commands/pull.js";
import { runClone } from "./commands/clone.js";
import { setJsonMode } from "./util/log.js";
import type { TalkOptions } from "./protocol/types.js";
import { VERSION } from "./version.js";

/**
 * The README's natural-language forms `act send <file> to <host>` and
 * `act pull <file> from <host>` include a literal preposition keyword. Strip it
 * and expect exactly `<file> <host>`.
 */
function normalizeTransferArgs(args: string[]): [string, string] {
  const cleaned = args.filter((a) => a !== "to" && a !== "from");
  if (cleaned.length < 2) {
    throw new Error("Expected form: <file> to|from <host>");
  }
  return [cleaned[0]!, cleaned[1]!];
}

const program = new Command();

program
  .name("act")
  .description("Agent-to-agent crosstalk, across your machines.")
  .version(VERSION);

program
  .command("init")
  .description("One-shot setup: ZeroTier + SSH + transfer config. Run once per machine.")
  .option("-f, --force", "re-generate the SSH keypair and overwrite existing config")
  .option("--zerotier-token <token>", "ZeroTier Central API token (or set $ZEROTIER_API_TOKEN)")
  .option("--zerotier-network <id>", "ZeroTier network id (auto-picked if you have one network)")
  .action((opts) =>
    runInit({
      force: opts.force,
      zerotierToken: opts.zerotierToken,
      zerotierNetwork: opts.zerotierNetwork,
    } satisfies InitOptions),
  );

program
  .command("peers")
  .description("List machines on your Tailnet.")
  .option("--json", "emit JSON")
  .action((opts) => {
    setJsonMode(Boolean(opts.json));
    return runPeers({ json: Boolean(opts.json) });
  });

program
  .command("talk")
  .description("Run a task in Claude Code on <host> and stream the result back.")
  .argument("<host>", "target host (name / MagicDNS / Tailscale IP)")
  .argument("<task>", "task to run on the host")
  .option("-p, --project <path>", "project dir on the host")
  .option("-m, --model <model>", "Claude model alias or id")
  .option("--max-turns <n>", "cap on agentic turns", (v) => Number(v))
  .option(
    "--permission-mode <mode>",
    "default | acceptEdits | plan | bypassPermissions (default: bypassPermissions)",
  )
  .option("--allowed-tools <tools...>", "auto-approve these tool patterns")
  .option("--output-format <fmt>", "text | json | stream-json", "stream-json")
  .action((host: string, task: string, opts) =>
    runTalk(host, task, {
      project: opts.project,
      model: opts.model,
      maxTurns: opts.maxTurns,
      permissionMode: opts.permissionMode,
      allowedTools: opts.allowedTools,
      outputFormat: opts.outputFormat,
    } satisfies TalkOptions),
  );

program
  .command("diff")
  .description("Diff a project between this machine and <host>.")
  .argument("<host>", "target host")
  .option("-p, --path <dir>", "local project dir (default: cwd)")
  .option("--remote-path <dir>", "project dir on the host (default: same as --path)")
  .option("--json", "emit JSON")
  .action((host: string, opts) => {
    setJsonMode(Boolean(opts.json));
    return runDiff(host, { path: opts.path, remotePath: opts.remotePath, json: Boolean(opts.json) });
  });

program
  .command("send")
  .description("Send <file> to <host> — point-to-point, end-to-end encrypted (SFTP over SSH).")
  .usage("<file> to <host>")
  .allowExcessArguments()
  .argument("<rest...>")
  .option("--to <dir>", "receive dir on the host (default: host's home)")
  .action((rest: string[], opts) => {
    const [file, host] = normalizeTransferArgs(rest);
    return runSend(file, host, { to: opts.to });
  });

program
  .command("pull")
  .description("Pull <file> from <host> — point-to-point, end-to-end encrypted.")
  .usage("<file> from <host>")
  .allowExcessArguments()
  .argument("<rest...>")
  .option("-o, --out <dir>", "local destination dir (default: cwd)")
  .action((rest: string[], opts) => {
    const [file, host] = normalizeTransferArgs(rest);
    return runPull(file, host, { out: opts.out });
  });

program
  .command("clone")
  .description("Clone a project directory from a peer (git bundle if it's a repo, else tar).")
  .argument("<host>", "peer name / IP / nodeId")
  .argument("<path>", "project dir on the peer")
  .option("-o, --out <dir>", "local dest dir (default: cwd)")
  .option("--no-env", "do not pull the peer's .env")
  .action((host: string, remotePath: string, opts) => runClone(host, remotePath, { out: opts.out, noEnv: opts.noEnv }));

program.parseAsync(process.argv).catch((err: unknown) => {
  // commander already prints usage for its own errors; only print unexpected ones.
  if (err instanceof Error && !("code" in err)) {
    console.error(err);
  }
  process.exit(1);
});

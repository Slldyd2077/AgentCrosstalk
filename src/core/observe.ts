/**
 * Observe what a peer's Claude Code is currently doing.
 *
 * Claude Code writes each session live to `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`.
 * We find the most recently modified transcript and summarize its tail — that's
 * the peer's current/recent activity (project + recent messages/tool calls).
 *
 * (Windows-peer/PowerShell for now; posix peer is a TODO, like `act clone`.)
 */
import type { Remote } from "./remote.js";

export interface TranscriptEntry {
  role: string;
  text: string;
}

export interface TranscriptSummary {
  project: string;
  path: string;
  entries: TranscriptEntry[];
}

/** Best-effort project name from the encoded-cwd dir name (last path segment). */
export function decodeProjectName(encodedCwd: string): string {
  const segs = encodedCwd.split("-").filter(Boolean);
  return segs[segs.length - 1] ?? encodedCwd;
}

/** Pure: parse a transcript JSONL tail into readable entries (testable). */
export function summarizeTranscript(jsonl: string, project: string, transcriptPath: string): TranscriptSummary {
  const entries: TranscriptEntry[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(s) as Record<string, unknown>;
    } catch {
      continue;
    }
    const message = o.message as Record<string, unknown> | undefined;
    const role = (message?.role as string) ?? (o.type as string) ?? "?";
    let text = "";
    const c = message?.content;
    if (typeof c === "string") {
      text = c;
    } else if (Array.isArray(c)) {
      text = c
        .map((b: Record<string, unknown>) =>
          b?.type === "text"
            ? (b.text as string)
            : b?.type === "tool_use"
              ? `[tool:${b.name as string}]`
              : b?.type === "tool_result"
                ? "[result]"
                : "",
        )
        .join(" ")
        .trim();
    }
    if (text) entries.push({ role, text: String(text).replace(/\s+/g, " ").slice(0, 200) });
  }
  return { project, path: transcriptPath, entries };
}

async function peerHome(remote: Remote): Promise<{ home: string; isWin: boolean }> {
  const isWin = (await remote.detectOs()).startsWith("win");
  const q = isWin ? "Write-Output $env:USERPROFILE" : "echo $HOME";
  return { home: (await remote.execCapture(q)).stdout.trim(), isWin };
}

/** Find the most recently modified transcript on the peer. */
export async function findLatestTranscript(remote: Remote): Promise<{ path: string; project: string } | null> {
  const { home, isWin } = await peerHome(remote);
  const projDir = isWin ? `${home}\\.claude\\projects` : `${home}/.claude/projects`;
  const cmd = `Get-ChildItem '${projDir}' -Recurse -Filter *.jsonl -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName`;
  const r = await remote.execCapture(cmd); // PowerShell (Windows peer)
  const p = r.stdout.trim().split(/\r?\n/)[0] ?? "";
  if (!p) return null;
  const parts = p.replace(/\\/g, "/").split("/");
  const encodedCwd = parts[parts.length - 2] ?? "";
  return { path: p, project: decodeProjectName(encodedCwd) };
}

/** Read the last `lines` lines of a transcript (UTF-8 clean). */
export async function tailTranscript(remote: Remote, transcriptPath: string, lines = 25): Promise<string> {
  const cmd = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Content -Encoding UTF8 -Tail ${lines} '${transcriptPath}'`;
  return (await remote.execCapture(cmd)).stdout;
}

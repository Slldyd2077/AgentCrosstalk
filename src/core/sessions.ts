/**
 * Persistent mesh sessions — `act mesh` conversation threads with a peer.
 *
 * Claude Code's `--resume <session_id>` continues a prior headless conversation
 * (verified: the peer's Claude recalls context from earlier turns). We key a
 * thread by (peer name, thread label) so `act mesh <host> "<msg>"` picks up
 * where the last message to that peer left off, without the caller tracking
 * session ids by hand.
 *
 * Stored in `sessions.json` next to config.json — separate file so frequent
 * session updates don't rewrite the larger config (peers/zerotier/etc).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getConfigDir } from "./config.js";

export const DEFAULT_THREAD = "default";

const ThreadSchema = z.object({
  sessionId: z.string(),
  project: z.string().optional(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  turnCount: z.number().int().nonnegative(),
  lastSummary: z.string().optional(),
});
export type Thread = z.infer<typeof ThreadSchema>;

// peerName -> threadLabel -> Thread
const SessionsFileSchema = z.record(z.string(), z.record(z.string(), ThreadSchema));
export type SessionsFile = z.infer<typeof SessionsFileSchema>;

function sessionsPath(): string {
  return path.join(getConfigDir(), "sessions.json");
}

export function loadSessions(file: string = sessionsPath()): SessionsFile {
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`sessions file at ${file} is not valid JSON: ${(e as Error).message}`);
  }
  const result = SessionsFileSchema.safeParse(parsed);
  if (!result.success) throw new Error(`sessions file at ${file} failed validation: ${result.error.message}`);
  return result.data;
}

export function saveSessions(data: SessionsFile, file: string = sessionsPath()): void {
  const validated = SessionsFileSchema.parse(data);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** Look up a thread for (peer, label). Undefined if none yet. */
export function getThread(sessions: SessionsFile, peerName: string, label: string = DEFAULT_THREAD): Thread | undefined {
  return sessions[peerName]?.[label];
}

/** Upsert a thread for (peer, label); returns a new SessionsFile (immutable). */
export function upsertThread(sessions: SessionsFile, peerName: string, label: string, thread: Thread): SessionsFile {
  return { ...sessions, [peerName]: { ...sessions[peerName], [label]: thread } };
}

/** Drop a thread (used by --new to force a fresh conversation). */
export function dropThread(sessions: SessionsFile, peerName: string, label: string): SessionsFile {
  if (!sessions[peerName]) return sessions;
  const { [label]: _drop, ...rest } = sessions[peerName];
  return { ...sessions, [peerName]: rest };
}

/** List all (peer, label) threads, most-recently-used first. */
export function listThreads(sessions: SessionsFile): Array<{ peer: string; label: string; thread: Thread }> {
  const out: Array<{ peer: string; label: string; thread: Thread }> = [];
  for (const [peer, threads] of Object.entries(sessions)) {
    for (const [label, thread] of Object.entries(threads)) {
      out.push({ peer, label, thread });
    }
  }
  out.sort((a, b) => b.thread.lastUsedAt.localeCompare(a.thread.lastUsedAt));
  return out;
}

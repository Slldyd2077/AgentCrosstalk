import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSessions, saveSessions, getThread, upsertThread, dropThread, listThreads, DEFAULT_THREAD } from "./sessions.js";
import type { Thread } from "./sessions.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "act-sessions-"));
  file = path.join(dir, "sessions.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mkThread = (sessionId: string): Thread => ({
  sessionId,
  createdAt: "2026-01-01T00:00:00Z",
  lastUsedAt: "2026-01-01T00:00:00Z",
  turnCount: 1,
});

describe("sessions", () => {
  it("returns {} when the file is absent", () => {
    expect(loadSessions(file)).toEqual({});
  });

  it("round-trips a saved file", () => {
    const s = upsertThread({}, "desk", DEFAULT_THREAD, mkThread("s1"));
    saveSessions(s, file);
    expect(loadSessions(file)).toEqual(s);
  });

  it("getThread finds by peer+label, undefined otherwise", () => {
    const s = upsertThread({}, "desk", DEFAULT_THREAD, mkThread("s1"));
    expect(getThread(s, "desk")?.sessionId).toBe("s1");
    expect(getThread(s, "desk", "other-topic")).toBeUndefined();
    expect(getThread(s, "unknown-peer")).toBeUndefined();
  });

  it("upsertThread is immutable and supports multiple labels per peer", () => {
    let s = upsertThread({}, "desk", DEFAULT_THREAD, mkThread("s1"));
    s = upsertThread(s, "desk", "refactor", mkThread("s2"));
    expect(getThread(s, "desk", DEFAULT_THREAD)?.sessionId).toBe("s1");
    expect(getThread(s, "desk", "refactor")?.sessionId).toBe("s2");
  });

  it("dropThread removes just the one label", () => {
    let s = upsertThread({}, "desk", DEFAULT_THREAD, mkThread("s1"));
    s = upsertThread(s, "desk", "refactor", mkThread("s2"));
    s = dropThread(s, "desk", DEFAULT_THREAD);
    expect(getThread(s, "desk", DEFAULT_THREAD)).toBeUndefined();
    expect(getThread(s, "desk", "refactor")?.sessionId).toBe("s2");
  });

  it("dropThread on unknown peer is a no-op", () => {
    const s = upsertThread({}, "desk", DEFAULT_THREAD, mkThread("s1"));
    expect(dropThread(s, "nope", DEFAULT_THREAD)).toEqual(s);
  });

  it("listThreads sorts most-recently-used first", () => {
    let s = upsertThread({}, "desk", DEFAULT_THREAD, { ...mkThread("s1"), lastUsedAt: "2026-01-01T00:00:00Z" });
    s = upsertThread(s, "laptop", DEFAULT_THREAD, { ...mkThread("s2"), lastUsedAt: "2026-02-01T00:00:00Z" });
    const list = listThreads(s);
    expect(list[0]!.peer).toBe("laptop");
    expect(list[1]!.peer).toBe("desk");
  });

  it("rejects malformed JSON", () => {
    writeFileSync(file, "{not json");
    expect(() => loadSessions(file)).toThrow(/not valid JSON/);
  });

  it("rejects schema violations", () => {
    writeFileSync(file, JSON.stringify({ desk: { default: { sessionId: "s1" } } })); // missing required fields
    expect(() => loadSessions(file)).toThrow(/failed validation/);
  });
});

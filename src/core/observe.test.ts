import { describe, it, expect } from "vitest";
import { summarizeTranscript, decodeProjectName } from "./observe.js";

describe("decodeProjectName", () => {
  it("takes the last segment of the encoded cwd", () => {
    expect(decodeProjectName("C--Users-Administrator-Downloads-PowerfulTS")).toBe("PowerfulTS");
    expect(decodeProjectName("E--AgentCrosstalk")).toBe("AgentCrosstalk");
  });
  it("falls back to the whole string if no dashes", () => {
    expect(decodeProjectName("proj")).toBe("proj");
  });
});

describe("summarizeTranscript", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { role: "user", content: "refactor index.ts" } }),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "on it" },
          { type: "tool_use", name: "Edit", input: {} },
        ],
      },
    }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } }),
    "not-json-line",
  ].join("\n");

  const s = summarizeTranscript(jsonl, "PowerfulTS", "/path/to/x.jsonl");

  it("skips unparseable lines", () => {
    expect(s.entries).toHaveLength(3);
  });
  it("extracts user text", () => {
    expect(s.entries[0]).toEqual({ role: "user", text: "refactor index.ts" });
  });
  it("extracts assistant text + tool_use", () => {
    expect(s.entries[1]!.text).toBe("on it [tool:Edit]");
    expect(s.entries[1]!.role).toBe("assistant");
  });
  it("marks tool_result", () => {
    expect(s.entries[2]!.text).toBe("[result]");
  });
  it("keeps project + path", () => {
    expect(s.project).toBe("PowerfulTS");
    expect(s.path).toBe("/path/to/x.jsonl");
  });
});

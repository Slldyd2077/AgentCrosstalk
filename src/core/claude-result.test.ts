import { describe, it, expect } from "vitest";
import { parseClaudeResult } from "./claude-result.js";

const FIXTURE = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  duration_ms: 11029,
  num_turns: 1,
  result: "hello world",
  session_id: "11111111-1111-1111-1111-111111111111",
  total_cost_usd: 0.229977,
  usage: { input_tokens: 45429, output_tokens: 112 },
  permission_denials: [],
});

describe("parseClaudeResult", () => {
  it("extracts answer + metadata", () => {
    const s = parseClaudeResult(FIXTURE);
    expect(s.ok).toBe(true);
    expect(s.answer).toBe("hello world");
    expect(s.turns).toBe(1);
    expect(s.costUsd).toBeCloseTo(0.23);
    expect(s.inputTokens).toBe(45429);
    expect(s.outputTokens).toBe(112);
    expect(s.sessionId).toBe("11111111-1111-1111-1111-111111111111");
    expect(s.permissionDenials).toEqual([]);
  });

  it("flags is_error", () => {
    const s = parseClaudeResult(JSON.stringify({ is_error: true, result: "boom" }));
    expect(s.ok).toBe(false);
    expect(s.answer).toBe("boom");
  });

  it("handles non-JSON (error text) gracefully", () => {
    const s = parseClaudeResult("claude: command not found");
    expect(s.ok).toBe(false);
    expect(s.answer).toBe("claude: command not found");
  });
});

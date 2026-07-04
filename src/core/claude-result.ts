/**
 * Parse the JSON result of `claude -p --output-format json` into a clean summary.
 *
 * The raw object has many fields; we surface the useful ones (answer, cost,
 * tokens, permission denials) and keep `raw` for debugging. Pure so it can be
 * unit-tested against a captured fixture.
 */

export interface ClaudeResultSummary {
  ok: boolean;
  answer: string;
  turns: number | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  sessionId: string | null;
  permissionDenials: unknown[];
  durationMs: number | null;
  raw: unknown;
}

const NULLS = {
  turns: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  sessionId: null,
  durationMs: null,
};

export function parseClaudeResult(json: string): ClaudeResultSummary {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // Not JSON (e.g. an error message) — return it verbatim as the answer.
    return { ok: false, answer: json, permissionDenials: [], raw: json, ...NULLS };
  }

  const usage = (obj.usage ?? {}) as Record<string, unknown>;
  const result = obj.result;
  return {
    ok: obj.is_error !== true,
    answer: typeof result === "string" ? result : result == null ? "" : JSON.stringify(result),
    turns: (obj.num_turns as number) ?? null,
    costUsd: (obj.total_cost_usd as number) ?? null,
    inputTokens: (usage.input_tokens as number) ?? null,
    outputTokens: (usage.output_tokens as number) ?? null,
    sessionId: (obj.session_id as string) ?? null,
    permissionDenials: (obj.permission_denials as unknown[]) ?? [],
    durationMs: (obj.duration_ms as number) ?? null,
    raw: obj,
  };
}

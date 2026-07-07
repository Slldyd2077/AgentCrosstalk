import { describe, it, expect } from "vitest";
import { buildClaudeCommand, psSingleQuote } from "./claude-invocation.js";

describe("psSingleQuote", () => {
  it("wraps in single quotes", () => {
    expect(psSingleQuote("hi")).toBe("'hi'");
  });
  it("doubles embedded single quotes", () => {
    expect(psSingleQuote("it's")).toBe("'it''s'");
  });
});

describe("buildClaudeCommand", () => {
  it("builds a minimal headless command", () => {
    const cmd = buildClaudeCommand({ claudePath: "claude", task: "list files" });
    expect(cmd).toContain("& 'claude'");
    expect(cmd).toContain("-p 'list files'");
    expect(cmd).toContain("--output-format 'stream-json'");
  });

  it("cd's into the project and adds --add-dir", () => {
    const cmd = buildClaudeCommand({ claudePath: "claude", task: "x", project: "C:\\proj" });
    expect(cmd.startsWith("cd 'C:\\proj';")).toBe(true);
    expect(cmd).toContain("--add-dir 'C:\\proj'");
  });

  it("escapes single quotes in the task", () => {
    const cmd = buildClaudeCommand({ claudePath: "claude", task: "it's fine" });
    expect(cmd).toContain("-p 'it''s fine'");
  });

  it("includes optional flags", () => {
    const cmd = buildClaudeCommand({
      claudePath: "claude",
      task: "x",
      model: "sonnet",
      maxTurns: 5,
      permissionMode: "acceptEdits",
      allowedTools: ["Bash(git:*)", "Edit"],
    });
    expect(cmd).toContain("--model 'sonnet'");
    expect(cmd).toContain("--max-turns 5");
    expect(cmd).toContain("--permission-mode 'acceptEdits'");
    expect(cmd).toContain("--allowedTools 'Bash(git:*),Edit'");
  });

  it("quotes a claude path with spaces via the call operator", () => {
    const cmd = buildClaudeCommand({ claudePath: "C:\\Program Files\\claude.cmd", task: "x" });
    expect(cmd).toContain("& 'C:\\Program Files\\claude.cmd'");
  });

  it("adds --resume when a session id is given", () => {
    const cmd = buildClaudeCommand({ claudePath: "claude", task: "continue", resumeSessionId: "abc-123" });
    expect(cmd).toContain("--resume 'abc-123'");
  });

  it("omits --resume when no session id is given", () => {
    const cmd = buildClaudeCommand({ claudePath: "claude", task: "x" });
    expect(cmd).not.toContain("--resume");
  });
});

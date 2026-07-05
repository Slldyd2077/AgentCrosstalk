import { describe, it, expect } from "vitest";
import { parsePathKind, buildBundleCommand, buildTarCommand, DEFAULT_TAR_EXCLUDES } from "./clone.js";

describe("parsePathKind", () => {
  it("maps known kinds", () => {
    expect(parsePathKind("git-dir")).toBe("git-dir");
    expect(parsePathKind("plain-dir")).toBe("plain-dir");
    expect(parsePathKind("file")).toBe("file");
  });
  it("falls back to none on garbage/empty", () => {
    expect(parsePathKind("nope")).toBe("none");
    expect(parsePathKind("")).toBe("none");
    expect(parsePathKind("  git-dir  ")).toBe("git-dir"); // trimmed
  });
});

describe("buildBundleCommand", () => {
  it("builds a git bundle --all command with quoted paths", () => {
    const cmd = buildBundleCommand("C:\\proj", "C:\\Users\\me\\act-clone.bundle");
    expect(cmd).toContain("git -C 'C:\\proj'");
    expect(cmd).toContain("bundle create 'C:\\Users\\me\\act-clone.bundle'");
    expect(cmd).toContain("--branches --tags");
  });
});

describe("buildTarCommand", () => {
  it("zip form on windows (no gzip)", () => {
    const cmd = buildTarCommand("C:\\code", "proj", "C:\\me\\act-clone.zip", DEFAULT_TAR_EXCLUDES, false);
    expect(cmd).toContain("-acf");
    expect(cmd).toContain("'C:\\me\\act-clone.zip'");
    expect(cmd).toContain("-C 'C:\\code' 'proj'");
    expect(cmd).toContain("--exclude='*node_modules*'");
  });
  it("gzip form on posix", () => {
    const cmd = buildTarCommand("/code", "proj", "/tmp/a.tar.gz", DEFAULT_TAR_EXCLUDES, true);
    expect(cmd).toContain("-czf");
    expect(cmd).toContain("/tmp/a.tar.gz");
  });
});

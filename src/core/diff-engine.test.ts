import { describe, it, expect } from "vitest";
import { parseRemoteHashes, compareTrees, buildRemoteHashCommand } from "./diff-engine.js";

const HEX64_A = "a1".repeat(32);
const HEX64_B = "b2".repeat(32);

describe("parseRemoteHashes (Windows)", () => {
  const stdout = [
    `${HEX64_A.toUpperCase()}  \\src\\a.ts`,
    `${HEX64_B.toUpperCase()}  \\node_modules\\x.js`,
    `${HEX64_A.toUpperCase()}  \\README.md`,
  ].join("\n");

  const m = parseRemoteHashes(stdout, true);

  it("parses hash (lowercased) + relpath, normalizes backslashes", () => {
    expect(m.get("src/a.ts")).toBe(HEX64_A);
    expect(m.get("README.md")).toBe(HEX64_A);
  });

  it("filters node_modules", () => {
    expect(m.has("node_modules/x.js")).toBe(false);
  });
});

describe("parseRemoteHashes (posix)", () => {
  const m = parseRemoteHashes(`${HEX64_A}  ./src/b.ts\n${HEX64_B}  ./.git/config`, false);
  it("strips ./ prefix and filters .git", () => {
    expect(m.get("src/b.ts")).toBe(HEX64_A);
    expect(m.has(".git/config")).toBe(false);
  });
});

describe("compareTrees", () => {
  it("classifies added / removed / modified", () => {
    const local = new Map<string, string>([
      ["same.ts", "1111"],
      ["changed.ts", "2222"],
      ["only-local.ts", "3333"],
    ]);
    const remote = new Map<string, string>([
      ["same.ts", "1111"],
      ["changed.ts", "9999"],
      ["only-remote.ts", "4444"],
    ]);
    const byPath = Object.fromEntries(compareTrees(local, remote).map((e) => [e.path, e.status]));
    expect(byPath["same.ts"]).toBeUndefined();
    expect(byPath["changed.ts"]).toBe("modified");
    expect(byPath["only-local.ts"]).toBe("added");
    expect(byPath["only-remote.ts"]).toBe("removed");
  });

  it("returns empty when trees match", () => {
    const t = new Map([["a", "x"]]);
    expect(compareTrees(t, new Map(t))).toEqual([]);
  });
});

describe("buildRemoteHashCommand", () => {
  it("Windows: PowerShell Get-FileHash walk", () => {
    const cmd = buildRemoteHashCommand("C:\\proj", true);
    expect(cmd).toContain("Get-FileHash");
    expect(cmd).toContain("C:\\proj");
  });
  it("posix: find + sha256sum", () => {
    const cmd = buildRemoteHashCommand("/home/u/proj", false);
    expect(cmd).toContain("sha256sum");
    expect(cmd).toContain("/home/u/proj");
  });
});

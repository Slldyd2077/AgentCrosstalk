import { describe, it, expect } from "vitest";
import { authorizedKeysPath, windowsAdminAclCommand } from "./ssh-keys.js";

describe("authorizedKeysPath", () => {
  it("windows admin -> ProgramData file", () => {
    expect(authorizedKeysPath("alice", true, "win32")).toBe(
      "C:\\ProgramData\\ssh\\administrators_authorized_keys",
    );
  });
  it("windows standard user -> per-user file", () => {
    expect(authorizedKeysPath("alice", false, "win32")).toBe(
      "C:\\Users\\alice\\.ssh\\authorized_keys",
    );
  });
  it("posix -> home .ssh", () => {
    expect(authorizedKeysPath("alice", false, "linux")).toBe("/home/alice/.ssh/authorized_keys");
  });
});

describe("windowsAdminAclCommand", () => {
  it("locks the file to Administrators + SYSTEM only", () => {
    const file = "C:\\ProgramData\\ssh\\administrators_authorized_keys";
    const cmd = windowsAdminAclCommand(file);
    expect(cmd).toContain(`"${file}"`);
    expect(cmd).toContain("/inheritance:r");
    expect(cmd).toContain('"Administrators:F"');
    expect(cmd).toContain('"SYSTEM:F"');
  });
});

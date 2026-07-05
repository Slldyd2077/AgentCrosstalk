import { describe, it, expect } from "vitest";
import { parseMembers } from "./zerotier.js";

// Fixture mirrors the ZeroTier Central member-list response shape (fake data).
const RAW = [
  {
    nodeId: "a1b2c3d4e5",
    name: "desk",
    config: { ipAssignments: ["10.147.17.1"] },
    os: "windows",
    lastOnline: 1700000000000,
  },
  { nodeId: "f9e8d7c6b5", name: "", config: { ipAssignments: ["10.147.17.2"] }, os: "linux" },
  { nodeId: "0000000001", name: "no-ip", config: { ipAssignments: [] } }, // dropped: no IP
  { nodeId: "0000000002", name: "no-config" }, // dropped: no config
];

describe("parseMembers", () => {
  const members = parseMembers(RAW as Parameters<typeof parseMembers>[0]);

  it("drops members without a managed IP", () => {
    expect(members).toHaveLength(2);
  });

  it("maps nodeId / name / ip / os / lastOnline", () => {
    const first = members.find((m) => m.nodeId === "a1b2c3d4e5");
    expect(first?.name).toBe("desk");
    expect(first?.ip).toBe("10.147.17.1");
    expect(first?.os).toBe("windows");
    expect(first?.lastOnline).toBe(1700000000000);
  });

  it("keeps members with an empty name", () => {
    expect(members.find((m) => m.nodeId === "f9e8d7c6b5")?.name).toBe("");
  });
});

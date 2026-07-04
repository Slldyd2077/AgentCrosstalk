import { describe, it, expect } from "vitest";
import { parseMembers } from "./zerotier.js";

// Fixture mirrors the real ZeroTier Central member-list response shape.
const RAW = [
  {
    nodeId: "96b00b7aba",
    name: "游戏本",
    config: { ipAssignments: ["192.168.196.91"] },
    os: "windows",
    lastOnline: 1783103124104,
  },
  { nodeId: "230699b381", name: "", config: { ipAssignments: ["192.168.196.182"] }, os: "linux" },
  { nodeId: "0000000001", name: "no-ip", config: { ipAssignments: [] } }, // dropped: no IP
  { nodeId: "0000000002", name: "no-config" }, // dropped: no config
];

describe("parseMembers", () => {
  const members = parseMembers(RAW as Parameters<typeof parseMembers>[0]);

  it("drops members without a managed IP", () => {
    expect(members).toHaveLength(2);
  });

  it("maps nodeId / name / ip / os / lastOnline", () => {
    const first = members.find((m) => m.nodeId === "96b00b7aba");
    expect(first?.name).toBe("游戏本");
    expect(first?.ip).toBe("192.168.196.91");
    expect(first?.os).toBe("windows");
    expect(first?.lastOnline).toBe(1783103124104);
  });

  it("keeps members with an empty name", () => {
    expect(members.find((m) => m.nodeId === "230699b381")?.name).toBe("");
  });
});

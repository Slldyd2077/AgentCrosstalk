import { describe, it, expect } from "vitest";
import { findPeer } from "./peers.js";
import type { Peer } from "../protocol/types.js";

const peers: Peer[] = [
  { name: "游戏本", ip: "192.168.196.91", user: "u", port: 22, nodeId: "96b00b7aba", os: "windows" },
  { name: "", ip: "192.168.196.182", user: "u", port: 22, nodeId: "230699b381" },
];

describe("findPeer", () => {
  it("matches by name", () => {
    expect(findPeer(peers, "游戏本")?.ip).toBe("192.168.196.91");
  });
  it("matches by exact IP", () => {
    expect(findPeer(peers, "192.168.196.182")?.nodeId).toBe("230699b381");
  });
  it("matches by ZeroTier nodeId", () => {
    expect(findPeer(peers, "230699b381")?.ip).toBe("192.168.196.182");
  });
  it("matches unnamed peer via IP substring", () => {
    expect(findPeer(peers, "196.182")?.nodeId).toBe("230699b381");
  });
  it("returns null on no match", () => {
    expect(findPeer(peers, "nope")).toBeNull();
  });
  it("returns null on empty query", () => {
    expect(findPeer(peers, "")).toBeNull();
  });
});

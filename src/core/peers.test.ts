import { describe, it, expect } from "vitest";
import { findPeer } from "./peers.js";
import type { Peer } from "../protocol/types.js";

const peers: Peer[] = [
  { name: "desk", ip: "10.147.17.1", user: "u", port: 22, nodeId: "a1b2c3d4e5", os: "windows" },
  { name: "", ip: "10.147.17.2", user: "u", port: 22, nodeId: "f9e8d7c6b5" },
];

describe("findPeer", () => {
  it("matches by name", () => {
    expect(findPeer(peers, "desk")?.ip).toBe("10.147.17.1");
  });
  it("matches by exact IP", () => {
    expect(findPeer(peers, "10.147.17.2")?.nodeId).toBe("f9e8d7c6b5");
  });
  it("matches by ZeroTier nodeId", () => {
    expect(findPeer(peers, "f9e8d7c6b5")?.ip).toBe("10.147.17.2");
  });
  it("matches unnamed peer via IP substring", () => {
    expect(findPeer(peers, "17.2")?.nodeId).toBe("f9e8d7c6b5");
  });
  it("returns null on no match", () => {
    expect(findPeer(peers, "nope")).toBeNull();
  });
  it("returns null on empty query", () => {
    expect(findPeer(peers, "")).toBeNull();
  });
});

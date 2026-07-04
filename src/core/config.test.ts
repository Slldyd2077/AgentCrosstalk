import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, saveConfig, newConfig, upsertPeer } from "./config.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "act-"));
  file = path.join(dir, "config.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("config", () => {
  it("returns null when absent", () => {
    expect(loadConfig(file)).toBeNull();
  });

  it("round-trips a config", () => {
    const cfg = newConfig("/tmp/id_act", 22);
    saveConfig(cfg, file);
    expect(loadConfig(file)).toEqual(cfg);
  });

  it("upserts peers by name", () => {
    let cfg = newConfig("/tmp/id_act");
    cfg = upsertPeer(cfg, { name: "b", ip: "100.1.1.1", user: "u", port: 22 });
    cfg = upsertPeer(cfg, { name: "b", ip: "100.1.1.2", user: "u", port: 22 });
    expect(cfg.peers).toHaveLength(1);
    expect(cfg.peers[0]?.ip).toBe("100.1.1.2");
  });

  it("rejects malformed JSON", () => {
    saveConfig(newConfig("/tmp/id_act"), file);
    writeFileSync(file, "{not json");
    expect(() => loadConfig(file)).toThrow(/not valid JSON/);
  });

  it("rejects schema violations", () => {
    // Missing required fields (peers, sshPort).
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, keyPairPath: "x" }));
    expect(() => loadConfig(file)).toThrow(/failed validation/);
  });
});

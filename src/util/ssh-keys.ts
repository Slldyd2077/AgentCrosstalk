/**
 * SSH keypair + authorized_keys helpers.
 *
 * Keypairs are generated with `ssh-keygen` (part of the OpenSSH client, which
 * `act init` ensures is installed on Windows). We default to ed25519.
 *
 * The Windows `authorized_keys` location depends on whether the target user is
 * an Administrator (`C:\ProgramData\ssh\administrators_authorized_keys`) or a
 * standard user (`C:\Users\<u>\.ssh\authorized_keys`), and the admin file needs
 * strict ACLs or sshd silently ignores it. These helpers centralize that logic
 * so it can be unit-tested without a live SSH session; the live install (append
 * pubkey + fix ACL over SSH) lives in `core/remote.ts` (M2).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { runCapture } from "./exec.js";

export interface KeyPair {
  privatePath: string;
  publicPath: string;
  publicKey: string;
}

/** Generate an ed25519 keypair at `privatePath` if one doesn't already exist. */
export async function ensureKeyPair(privatePath: string): Promise<KeyPair> {
  const publicPath = `${privatePath}.pub`;
  if (existsSync(privatePath) && existsSync(publicPath)) {
    return { privatePath, publicPath, publicKey: readFileSync(publicPath, "utf8").trim() };
  }
  mkdirSync(path.dirname(privatePath), { recursive: true });
  await runCapture("ssh-keygen", ["-q", "-t", "ed25519", "-f", privatePath, "-N", "", "-C", "act"]);
  if (process.platform !== "win32") {
    await runCapture("chmod", ["600", privatePath], { rejectOnError: false });
  }
  return { privatePath, publicPath, publicKey: readFileSync(publicPath, "utf8").trim() };
}

/** Path to the authorized_keys file for `user` on the given platform. */
export function authorizedKeysPath(user: string, isAdmin: boolean, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return isAdmin
      ? "C:\\ProgramData\\ssh\\administrators_authorized_keys"
      : path.join("C:\\Users", user, ".ssh", "authorized_keys");
  }
  // POSIX: best-effort home path. Caller may override with $HOME-aware logic.
  return path.posix.join("/home", user, ".ssh", "authorized_keys");
}

/** The icacls command that locks the Windows admin authorized_keys file to Admins+SYSTEM only. */
export function windowsAdminAclCommand(file: string): string {
  return `icacls "${file}" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"`;
}

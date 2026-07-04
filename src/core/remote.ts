/**
 * Remote — the SSH wrapper every cross-machine command (talk/diff/send/pull) shares.
 *
 * Uses `ssh2` directly for fine control over connect / exec / streaming.
 *
 * Trust bootstrap: on first contact, this machine's pubkey usually isn't on the
 * peer yet, so key auth fails. We then prompt for the peer's password once,
 * install our pubkey into the peer's authorized_keys (Windows ACL-aware), and
 * retry key auth — after which the connection is passwordless.
 */
import { readFileSync } from "node:fs";
import { Client } from "ssh2";
import { log } from "../util/log.js";
import { promptPassword } from "../util/prompt.js";
import { authorizedKeysPath, windowsAdminAclCommand } from "../util/ssh-keys.js";
import type { Peer } from "../protocol/types.js";

export interface ConnectOptions {
  /** Path to this machine's private key. */
  keyPath: string;
  /** This machine's public key (one line) — to install on the peer if needed. */
  publicKey: string;
  sshPort: number;
}

export interface CaptureResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface SshConnectArgs {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
}

/** Connect and resolve on "ready", reject on any error (incl. auth failure). */
function connectOnce(args: SshConnectArgs, readyTimeout = 20_000): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    conn.connect({ ...args, readyTimeout });
  });
}

export class Remote {
  private conn: Client;
  readonly peer: Peer;

  private constructor(conn: Client, peer: Peer) {
    this.conn = conn;
    this.peer = peer;
  }

  /** Connect to `peer` via key auth; on failure, bootstrap trust then retry. */
  static async connect(peer: Peer, opts: ConnectOptions): Promise<Remote> {
    const port = peer.port || opts.sshPort;
    const privateKey = readFileSync(opts.keyPath, "utf8");

    try {
      const conn = await connectOnce({ host: peer.ip, port, username: peer.user, privateKey });
      return new Remote(conn, peer);
    } catch {
      // Likely key not yet authorized → install it via a one-time password login.
      log.warn(`Key auth to ${peer.user}@${peer.ip} failed — bootstrapping trust (needs the peer's password once).`);
      const remote = await Remote.bootstrapTrust(peer, opts);
      log.success(`Trust established with ${peer.name || peer.ip}.`);
      return remote;
    }
  }

  /** Prompt for password, install our pubkey on the peer, then reconnect with the key. */
  private static async bootstrapTrust(peer: Peer, opts: ConnectOptions): Promise<Remote> {
    const port = peer.port || opts.sshPort;
    const password = await promptPassword(`Password for ${peer.user}@${peer.ip}: `);
    const pwConn = await connectOnce({ host: peer.ip, port, username: peer.user, password });
    const helper = new Remote(pwConn, peer);

    const osPlatform = await helper.detectOs();
    const isWindows = osPlatform.startsWith("win");
    const isAdmin = isWindows ? await helper.detectWindowsAdmin() : false;

    await helper.installPublicKey(opts.publicKey, isAdmin, isWindows);
    helper.close();

    const privateKey = readFileSync(opts.keyPath, "utf8");
    const conn = await connectOnce({ host: peer.ip, port, username: peer.user, privateKey });
    return new Remote(conn, peer);
  }

  /** Run a command, capture stdout/stderr + exit code. */
  execCapture(cmd: string): Promise<CaptureResult> {
    return new Promise((resolve, reject) => {
      this.conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        stream.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
        stream.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
        stream.on("close", (code: number) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 0 }));
        stream.end(); // EOF stdin so `claude -p` doesn't wait 3s for piped input
      });
    });
  }

  /** Run a command, streaming stdout/stderr straight to this process. Resolves with exit code. */
  execStream(cmd: string, opts: { pty?: boolean } = {}): Promise<number> {
    return new Promise((resolve, reject) => {
      // A PTY is needed for `croc`: over a plain SSH exec its stdin is a non-TTY
      // pipe, so croc treats it as piped data and sends stdin instead of the file.
      // claude -p doesn't need (and shouldn't get) a PTY.
      this.conn.exec(cmd, opts.pty ? { pty: true } : {}, (err, stream) => {
        if (err) return reject(err);
        stream.on("data", (d: Buffer) => process.stdout.write(d));
        stream.stderr.on("data", (d: Buffer) => process.stderr.write(d));
        stream.on("close", (code: number) => resolve(code ?? 0));
        if (!opts.pty) {
          // EOF on stdin: tells `claude -p` there's no piped input, so it doesn't
          // sit waiting 3s for stdin before proceeding.
          stream.end();
        }
      });
    });
  }

  /** Detect the peer's OS via node (Claude Code needs node, so it's present). */
  async detectOs(): Promise<string> {
    const r = await this.execCapture("node -p process.platform");
    return (r.stdout || process.platform).trim();
  }

  /** True if the SSH user is in the Windows Administrators group (SID S-1-5-32-544). */
  async detectWindowsAdmin(): Promise<boolean> {
    const r = await this.execCapture("whoami /groups");
    return /S-1-5-32-544/.test(r.stdout);
  }

  /** Resolve the absolute path to `claude` on the peer (caches nothing here). */
  async detectClaudePath(): Promise<string> {
    const osPlatform = await this.detectOs();
    const tool = osPlatform.startsWith("win") ? "where claude" : "which claude";
    const r = await this.execCapture(tool);
    if (r.code === 0 && r.stdout) return r.stdout.split(/\r?\n/)[0] ?? "claude";
    return "claude";
  }

  /** Install our public key into the peer's authorized_keys (idempotent, ACL-aware on Windows). */
  private async installPublicKey(publicKey: string, isAdmin: boolean, isWindows: boolean): Promise<void> {
    const key = publicKey.trim();
    if (isWindows) {
      const file = authorizedKeysPath(this.peer.user, isAdmin, "win32");
      const dir = file.slice(0, file.lastIndexOf("\\"));
      // Ensure dir + append key (duplicates are harmless to sshd).
      await this.execCapture(
        `powershell -NoProfile -Command "New-Item -Force -ItemType Directory -Path '${dir}' | Out-Null; Add-Content -Path '${file}' -Value '${key}'"`,
      );
      if (isAdmin) {
        // Lock the admin authorized_keys file to Admins + SYSTEM only, or sshd ignores it.
        await this.execCapture(windowsAdminAclCommand(file));
      }
    } else {
      await this.execCapture(
        `mkdir -p ~/.ssh && echo '${key}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`,
      );
    }
  }

  close(): void {
    this.conn.end();
  }

  /** SFTP download (peer → local). Reuses the SSH channel: direct P2P, E2E encrypted. */
  sftpGet(remotePath: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.fastGet(remotePath, localPath, (e: Error | null | undefined) => (e ? reject(e) : resolve()));
      });
    });
  }

  /** SFTP upload (local → peer). `remotePath` may be relative → resolves to the peer's home. */
  sftpPut(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.fastPut(localPath, remotePath, (e: Error | null | undefined) => (e ? reject(e) : resolve()));
      });
    });
  }
}

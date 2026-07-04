/**
 * Ensure a machine can be SSHed into.
 *
 * Windows: Tailscale SSH has no Windows server component, so we rely on the
 * system OpenSSH server. `ensureSshd()` enables the OpenSSH.Client + Server
 * capabilities, starts `sshd`, sets it to auto-start, opens the firewall port,
 * and sets PowerShell as the DefaultShell (so remote commands behave
 * predictably instead of landing in cmd.exe).
 *
 * macOS/Linux: automated sshd enablement is out of MVP scope — we warn and ask
 * the user to ensure sshd + PubkeyAuthentication manually.
 */
import process from "node:process";
import { runCapture } from "./exec.js";
import { log } from "./log.js";

/** True if the current process is running elevated / as root. */
export async function isElevated(): Promise<boolean> {
  if (process.platform === "win32") {
    // `net session` succeeds only for elevated sessions.
    const r = await runCapture("net", ["session"], { rejectOnError: false });
    return r.exitCode === 0;
  }
  return typeof process.getuid === "function" && process.getuid() === 0;
}

const POWERSHELL_DEFAULT_SHELL =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

/** Idempotently enable + start the OpenSSH server on Windows. Requires elevation. */
async function ensureWindowsOpenSsh(): Promise<void> {
  if (!(await isElevated())) {
    throw new Error(
      [
        "act init must enable the OpenSSH server on Windows, which requires an",
        "Administrator terminal. Re-run elevated, e.g. from PowerShell:",
        "  Start-Process powershell -Verb RunAs -ArgumentList 'npx agentcrosstalk init'",
      ].join("\n"),
    );
  }

  // Single PowerShell invocation for speed (each startup is ~300ms).
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0 | Out-Null
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}
if (-not (Test-Path 'HKLM:\\SOFTWARE\\OpenSSH')) { New-Item -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Force | Out-Null }
New-ItemProperty -Path 'HKLM:\\SOFTWARE\\OpenSSH' -Name DefaultShell -Value '${POWERSHELL_DEFAULT_SHELL}' -PropertyType String -Force | Out-Null
`.trim();

  const r = await runCapture("powershell", ["-NoProfile", "-Command", script], {
    rejectOnError: false,
  });
  if (r.exitCode !== 0) {
    throw new Error(`Failed to enable OpenSSH server on Windows:\n${r.stderr || r.stdout}`);
  }
  log.success("OpenSSH server enabled and running (DefaultShell = PowerShell).");
}

/** Idempotently ensure sshd is running and accepting pubkey auth on this machine. */
export async function ensureSshd(): Promise<void> {
  if (process.platform === "win32") {
    await ensureWindowsOpenSsh();
    return;
  }
  log.warn(
    "On macOS/Linux, ensure sshd is installed, running, and PubkeyAuthentication is enabled " +
      "(automated setup is out of MVP scope).",
  );
}

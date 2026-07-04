/**
 * ZeroTier Central API client.
 *
 * ZeroTier's local CLI can't enumerate other members' managed IPs (only your
 * own), so we query the Central API with a read-only token. This gives the
 * member list — names + managed IPs + OS — that `act init` / `act peers` use.
 *
 * `parseMembers` is pure (raw API array in, our model out) so it can be tested
 * against a fixture without a network call.
 */

const DEFAULT_API_BASE = "https://api.zerotier.com/api/v1";

export interface ZerotierMember {
  nodeId: string;
  name: string; // may be empty string
  ip: string; // first managed IP
  os?: string;
  lastOnline?: number; // ms epoch
}

export interface ZerotierNetwork {
  id: string;
  name: string;
  description: string;
}

interface RawMember {
  nodeId: string;
  name?: string;
  description?: string;
  config?: { ipAssignments?: string[] };
  os?: string;
  lastOnline?: number;
}

interface RawNetwork {
  id: string;
  description?: string;
  config?: { name?: string };
}

async function apiGet<T>(apiBase: string, token: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new Error(`ZeroTier API request failed (${path}): ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`ZeroTier API rejected the token (${res.status}). Generate a fresh token at my.zerotier.com → Account → API Access Tokens.`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ZeroTier API ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Pure parser: raw member array → our model. Drops members without a managed IP. */
export function parseMembers(raw: RawMember[]): ZerotierMember[] {
  return raw
    .map((m) => ({
      nodeId: m.nodeId,
      name: m.name?.trim() ?? "",
      ip: m.config?.ipAssignments?.[0] ?? "",
      os: m.os,
      lastOnline: m.lastOnline,
    }))
    .filter((m) => m.ip);
}

/** List the caller's networks (used to auto-pick when the user has exactly one). */
export async function listNetworks(token: string, apiBase = DEFAULT_API_BASE): Promise<ZerotierNetwork[]> {
  const raw = await apiGet<RawNetwork[]>(apiBase, token, "/network");
  return raw.map((n) => ({
    id: n.id,
    name: n.config?.name?.trim() ?? "",
    description: n.description?.trim() ?? "",
  }));
}

/** List members of a network: names + managed IPs (+ OS, last-seen). */
export async function listMembers(
  token: string,
  networkId: string,
  apiBase = DEFAULT_API_BASE,
): Promise<ZerotierMember[]> {
  const raw = await apiGet<RawMember[]>(apiBase, token, `/network/${networkId}/member`);
  return parseMembers(raw);
}

export const DEFAULT_ZEROTIER_API_BASE = DEFAULT_API_BASE;

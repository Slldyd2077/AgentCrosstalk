/**
 * Peer lookup helpers (network-agnostic).
 *
 * `findPeer` resolves a user-typed host query (name, IP, or ZeroTier nodeId)
 * against the known peer list — used by `act talk` / `diff` / `pull` so
 * `act talk desk ...` or `act talk 10.147.17.1 ...` both work.
 */
import type { Peer } from "../protocol/types.js";

/**
 * Resolve a user-typed host query against known peers.
 *
 * Match order: exact name → exact IP → exact nodeId → substring of name/IP.
 * Case-insensitive throughout.
 */
export function findPeer(peers: Peer[], query: string): Peer | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const exact = peers.find(
    (p) => p.name.toLowerCase() === q || p.ip === q || p.nodeId?.toLowerCase() === q,
  );
  if (exact) return exact;

  const substr = peers.find(
    (p) => p.name.toLowerCase().includes(q) || p.ip.includes(q),
  );
  return substr ?? null;
}

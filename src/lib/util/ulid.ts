/**
 * Tiny lexicographically-sortable ID. Not a real ULID (no Crockford Base32),
 * but sorts by timestamp prefix and collision-resists enough for a prototype
 * where the ID lives inside a per-day chat file with at most a few hundred
 * messages.
 *
 * Format: <hex-ms-since-epoch>-<hex-random>
 */
export function ulid(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = crypto.getRandomValues(new Uint8Array(8));
  const randHex = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${ts}-${randHex}`;
}

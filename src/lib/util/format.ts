/** Stable, friendly helpers for rendering WebIDs and timestamps. */

const COLORS = [
  "#f97583", // pink
  "#ffab70", // orange
  "#ffea7f", // yellow
  "#85e89d", // green
  "#79b8ff", // blue
  "#b392f0", // purple
  "#ff7b72", // red
  "#7ee787", // mint
  "#a5d6ff", // sky
  "#d2a8ff", // violet
];

/**
 * Hash a string to a deterministic color from the palette. Identical input
 * always produces the same color, so a user's avatar stays stable.
 */
export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return COLORS[Math.abs(h) % COLORS.length] ?? COLORS[0]!;
}

/** First non-empty path segment of a WebID — the "username". */
export function shortName(webid: string): string {
  try {
    const u = new URL(webid);
    return u.pathname.split("/").filter(Boolean)[0] ?? webid;
  } catch {
    return webid;
  }
}

/** Initials for an avatar — at most 2 chars, uppercase. */
export function initials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/**
 * Friendly relative time: "just now", "2m", "1h", or hh:mm for >24h ago.
 * Pass the ISO string of when the message was created.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const delta = Math.max(0, now - t);
  const s = Math.floor(delta / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Absolute time tooltip ("May 26, 2026, 23:47"). */
export function absoluteTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

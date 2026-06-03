/** @mention parsing + resolution.
 *
 * A handle is a person's WebID first path segment — the same "username" that
 * {@link shortName} surfaces everywhere else in the UI (e.g.
 * `https://pod.mindpods.org/testuser/profile/card#me` → `testuser`). So
 * `@testuser` in a message resolves to that person's WebID, with no parallel
 * naming scheme to keep in sync.
 *
 * Nothing here touches the pod: mentions are a pure render/compose concern
 * layered over the message body. We never persist a separate "mentions" triple
 * — the `@handle` text already lives in `sioc:content`, and resolution is done
 * client-side against whoever the room already knows about.
 */
import { shortName } from "@/lib/util/format";

/**
 * Matches `@handle` not preceded by a word char or another `@`, so emails
 * (`a@b.com`) and `@@` don't get picked up. Handle chars mirror what
 * {@link shortName} can yield from a path segment. Keep this in lockstep with
 * the mention branch of `INLINE_RE` in MessageBody — both must agree on what a
 * mention looks like.
 */
export const MENTION_RE = /(?<![\w@])@([A-Za-z0-9][A-Za-z0-9._-]*)/g;

/** Same shape, anchored to the end — used by the composer to detect the
 *  `@handle` the caret is currently sitting inside while typing. */
export const MENTION_PREFIX_RE = /(?<![\w@])@([A-Za-z0-9._-]*)$/;

/** Lowercased handle → WebID for the people a room knows about. */
export function buildHandleMap(webids: Iterable<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const webid of webids) {
    const handle = shortName(webid).toLowerCase();
    if (handle) map.set(handle, webid);
  }
  return map;
}

export type MentionCandidate = { handle: string; webid: string };

/**
 * People whose handle starts with `prefix` (case-insensitive), de-duplicated
 * by handle and capped — the candidate list for the composer's autocomplete.
 * An empty prefix lists everyone (so a bare `@` opens the full roster).
 */
export function matchMentions(
  webids: Iterable<string>,
  prefix: string,
  limit = 8,
): MentionCandidate[] {
  const p = prefix.toLowerCase();
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const webid of webids) {
    const handle = shortName(webid);
    const key = handle.toLowerCase();
    if (!key || seen.has(key)) continue;
    if (p && !key.startsWith(p)) continue;
    seen.add(key);
    out.push({ handle, webid });
  }
  out.sort((a, b) => a.handle.localeCompare(b.handle));
  return out.slice(0, limit);
}

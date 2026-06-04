import type { ChatMessage } from "@/lib/solid/chat";

export type Participant = { webid: string; lastActive: string };

/**
 * Everyone the room knows about, derived the same way for every surface that
 * shows members (the desktop sidebar and the mobile members sheet) so the count
 * and the list never disagree: anyone who has posted, plus self, the room
 * creator, and any explicit (owner-only) ACL members.
 */
export function computeParticipants(
  messages: readonly ChatMessage[],
  selfWebid: string | null,
  creator: string | undefined,
  members: readonly string[],
): Participant[] {
  const seen = new Map<string, { lastActive: string }>();
  for (const m of messages) {
    const prev = seen.get(m.author);
    if (!prev || prev.lastActive < m.createdAtIso) {
      seen.set(m.author, { lastActive: m.createdAtIso });
    }
  }
  if (selfWebid && !seen.has(selfWebid)) seen.set(selfWebid, { lastActive: "" });
  if (creator && !seen.has(creator)) seen.set(creator, { lastActive: "" });
  for (const m of members) if (!seen.has(m)) seen.set(m, { lastActive: "" });
  return Array.from(seen.entries()).map(([webid, info]) => ({ webid, ...info }));
}

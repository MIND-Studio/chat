"use client";

import { useMemo } from "react";
import { Button } from "@mind-studio/ui";
import { Avatar } from "./Avatar";
import { InvitePanel } from "./InvitePanel";
import { colorForKey, shortName } from "@/lib/util/format";
import type { ChatMessage, RoomMeta } from "@/lib/solid/chat";

export function RoomSidebar({
  meta,
  messages,
  selfWebid,
  onSignOut,
  onInvite,
  members,
}: {
  meta: RoomMeta | null;
  messages: ChatMessage[];
  selfWebid: string | null;
  onSignOut: () => void;
  onInvite?: (webid: string) => Promise<void>;
  members: readonly string[];
}): React.JSX.Element {
  const isOwner = !!selfWebid && !!meta?.creator && selfWebid === meta.creator;
  const participants = useMemo(() => {
    const seen = new Map<string, { lastActive: string }>();
    for (const m of messages) {
      const prev = seen.get(m.author);
      if (!prev || prev.lastActive < m.createdAtIso) {
        seen.set(m.author, { lastActive: m.createdAtIso });
      }
    }
    if (selfWebid && !seen.has(selfWebid)) seen.set(selfWebid, { lastActive: "" });
    if (meta?.creator && !seen.has(meta.creator)) seen.set(meta.creator, { lastActive: "" });
    for (const m of members) if (!seen.has(m)) seen.set(m, { lastActive: "" });
    return Array.from(seen.entries()).map(([webid, info]) => ({ webid, ...info }));
  }, [messages, selfWebid, meta?.creator, members]);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[color:var(--border)] bg-[color:var(--bg-1)]/70 backdrop-blur-md md:flex">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-faint)]">
          <span className="inline-block size-1 rounded-full bg-[color:var(--cyan)] shadow-[0_0_8px_var(--cyan-glow)]" />
          mind/chat
        </div>
        <div className="mt-2 text-base font-semibold tracking-tight">
          <span className="text-[color:var(--text-faint)]">#</span>
          {meta?.title?.toLowerCase() ?? "general"}
        </div>
        <div
          className="mt-2 truncate font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]"
          title={meta?.url ?? ""}
        >
          {meta ? hostOf(meta.url) : ""}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-faint)]">
          <span>members</span>
          <span className="text-[color:var(--cyan)]">{participants.length.toString().padStart(2, "0")}</span>
        </div>
        {isOwner && onInvite ? (
          <div className="mb-3">
            <InvitePanel onInvite={onInvite} />
          </div>
        ) : null}
        <ul className="space-y-2">
          {participants.map((p) => {
            const accent = colorForKey(p.webid);
            return (
              <li
                key={p.webid}
                className="flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--glass-2)]"
              >
                <Avatar webid={p.webid} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-sm">
                    <span className="author-color" style={{ "--author-color": accent } as React.CSSProperties}>
                      {shortName(p.webid)}
                    </span>
                    {p.webid === selfWebid ? (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                        [you]
                      </span>
                    ) : null}
                    {p.webid === meta?.creator ? (
                      <span
                        className="ml-auto font-mono text-[9px] uppercase tracking-wider text-[color:var(--magenta)]"
                        title="room owner"
                      >
                        ★ owner
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="truncate font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]"
                    title={p.webid}
                  >
                    {hostOf(p.webid)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-[color:var(--border)] px-5 py-3">
        {selfWebid ? (
          <div className="flex items-center gap-2.5">
            <Avatar webid={selfWebid} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{shortName(selfWebid)}</div>
              <Button
                variant="link"
                onClick={onSignOut}
                className="h-auto justify-start p-0 font-mono text-[9px] font-normal uppercase tracking-wider text-[color:var(--text-faint)] hover:text-[color:var(--magenta)]"
              >
                disconnect
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

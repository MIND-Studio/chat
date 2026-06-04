"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@mind-studio/ui";
import { InvitePanel } from "./InvitePanel";
import { MemberList } from "./MemberList";
import { computeParticipants } from "@/lib/util/participants";
import type { ChatMessage, RoomMeta } from "@/lib/solid/chat";

/**
 * Mobile-only slide-over that surfaces the room's members, which otherwise live
 * in the `hidden md:flex` sidebar and are invisible on phones. Opened from a
 * member-count button in the room header. Desktop keeps using RoomSidebar.
 */
export function MembersSheet({
  open,
  onClose,
  meta,
  messages,
  selfWebid,
  members,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  meta: RoomMeta | null;
  messages: ChatMessage[];
  selfWebid: string | null;
  members: readonly string[];
  onInvite?: (webid: string) => Promise<void>;
}): React.JSX.Element | null {
  const isOwner = !!selfWebid && !!meta?.creator && selfWebid === meta.creator;
  const participants = useMemo(
    () => computeParticipants(messages, selfWebid, meta?.creator, members),
    [messages, selfWebid, meta?.creator, members],
  );

  // Close on Escape, and don't let the page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Room members">
      {/* Mouse-only backdrop catcher; keyboard/SR users close via Escape or the
          ✕ button, so it's hidden from the a11y tree to avoid a duplicate label. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-[color:var(--border)] bg-[color:var(--bg-1)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-faint)]">
            members{" "}
            <span className="text-[color:var(--cyan)]">
              {participants.length.toString().padStart(2, "0")}
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            aria-label="Close members"
            className="h-auto rounded border border-[color:var(--border)] px-2 py-0.5 font-mono text-[10px] leading-none text-[color:var(--text-faint)] hover:border-[color:var(--text-muted)] hover:text-[color:var(--text-muted)]"
          >
            <span aria-hidden>✕</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isOwner && onInvite ? (
            <div className="mb-3">
              <InvitePanel onInvite={onInvite} />
            </div>
          ) : null}
          <MemberList participants={participants} selfWebid={selfWebid} creator={meta?.creator} />
        </div>
      </aside>
    </div>
  );
}

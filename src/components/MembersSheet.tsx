"use client";

import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@mind-studio/ui";
import { InvitePanel } from "./InvitePanel";
import { MemberList } from "./MemberList";
import { computeParticipants } from "@/lib/util/participants";
import type { ChatMessage, RoomMeta } from "@/lib/solid/chat";

/**
 * Mobile-only slide-over that surfaces the room's members, which otherwise live
 * in the `hidden md:flex` sidebar and are invisible on phones. Opened from a
 * member-count button in the room header. Desktop keeps using RoomSidebar.
 *
 * Built on the `@mind-studio/ui` `Sheet` primitive — Radix handles the overlay,
 * Escape-to-close, scroll-lock, focus trap, and the close button for us.
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
}): React.JSX.Element {
  const isOwner = !!selfWebid && !!meta?.creator && selfWebid === meta.creator;
  const participants = useMemo(
    () => computeParticipants(messages, selfWebid, meta?.creator, members),
    [messages, selfWebid, meta?.creator, members],
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="left"
        aria-label="Room members"
        className="w-72 max-w-[85%] gap-0 border-r border-[color:var(--border)] bg-[color:var(--bg-1)] p-0 md:hidden"
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b border-[color:var(--border)] px-5 py-4">
          <SheetTitle className="font-mono text-[10px] font-normal uppercase tracking-[0.25em] text-[color:var(--text-faint)]">
            members{" "}
            <span className="text-[color:var(--cyan)]">
              {participants.length.toString().padStart(2, "0")}
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            People who can read and post in this room.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isOwner && onInvite ? (
            <div className="mb-3">
              <InvitePanel onInvite={onInvite} />
            </div>
          ) : null}
          <MemberList participants={participants} selfWebid={selfWebid} creator={meta?.creator} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

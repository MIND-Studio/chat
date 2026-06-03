"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/solid/session";
import {
  deleteMessage,
  editMessage,
  listTodayMessages,
  postMessage,
  readRoomMeta,
  toggleReaction,
  type ChatMessage,
  type RoomMeta,
} from "@/lib/solid/chat";
import {
  subscribeToRoom,
  type SubscriptionHandle,
  type SubscriptionState,
} from "@/lib/solid/chat-subscription";
import { addRoomMember, listRoomMembers } from "@/lib/solid/chat-acl";
import { roomUrl as DEMO_ROOM_URL } from "@/lib/config";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { ConnectionStatus, type ConnState } from "@/components/ConnectionStatus";
import { RoomSidebar } from "@/components/RoomSidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { shortName } from "@/lib/util/format";

export default function ChatPage() {
  const { webid, loggedIn, loading, fetch: authFetch, signOut } = useSession();
  const router = useRouter();

  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const subRef = useRef<SubscriptionHandle | null>(null);

  // Everyone the room knows about — explicit members (owner-only ACL read),
  // plus the room creator, self, and anyone who has posted. Drives both
  // @mention rendering and the composer's autocomplete.
  const knownWebids = useMemo(() => {
    const s = new Set<string>();
    for (const w of members) s.add(w);
    if (meta?.creator) s.add(meta.creator);
    if (webid) s.add(webid);
    for (const m of messages) s.add(m.author);
    return Array.from(s);
  }, [members, meta?.creator, webid, messages]);

  useEffect(() => {
    if (!loading && !loggedIn) router.replace("/");
  }, [loading, loggedIn, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!authFetch) return;
    let cancelled = false;
    let local: SubscriptionHandle | null = null;

    async function reload() {
      if (!authFetch) return;
      try {
        const m = await listTodayMessages(DEMO_ROOM_URL, authFetch, webid);
        if (!cancelled) setMessages(m);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("listTodayMessages failed", err);
      }
    }

    (async () => {
      if (!authFetch) return;
      let creator: string | undefined;
      try {
        const m = await readRoomMeta(DEMO_ROOM_URL, authFetch);
        if (!cancelled) setMeta(m);
        creator = m?.creator;
      } catch {
        /* ignore */
      }
      // Only the owner has Control on the ACL — for non-owners this 403s
      // and we just leave members empty (sidebar derives from messages).
      if (creator && webid === creator) {
        try {
          const list = await listRoomMembers(DEMO_ROOM_URL, creator, authFetch);
          if (!cancelled) setMembers(list);
        } catch {
          /* ignore */
        }
      }
      await reload();
      try {
        local = await subscribeToRoom(
          DEMO_ROOM_URL,
          authFetch,
          () => {
            void reload();
          },
          (s: SubscriptionState) => {
            if (!cancelled) setConnState(s);
          },
        );
        subRef.current = local;
      } catch (err) {
        if (!cancelled) {
          setConnState("error");
          setError((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
      local?.disconnect();
      subRef.current = null;
    };
  }, [authFetch]);

  async function handleInvite(memberWebid: string) {
    if (!authFetch || !webid || !meta?.creator) {
      throw new Error("Not ready");
    }
    if (webid !== meta.creator) {
      throw new Error("Only the room owner can invite.");
    }
    const updated = await addRoomMember(DEMO_ROOM_URL, meta.creator, memberWebid, authFetch);
    setMembers(updated);
  }

  async function handleReact(m: ChatMessage, emoji: string) {
    if (!authFetch || !webid) return;
    setError(null);
    try {
      await toggleReaction(m.url, emoji, webid, authFetch);
      const fresh = await listTodayMessages(DEMO_ROOM_URL, authFetch, webid);
      setMessages(fresh);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  async function handleDelete(m: ChatMessage) {
    if (!authFetch || !webid) return;
    if (m.author !== webid) {
      throw new Error("only the author can delete");
    }
    setError(null);
    try {
      await deleteMessage(DEMO_ROOM_URL, m.url, authFetch);
      const fresh = await listTodayMessages(DEMO_ROOM_URL, authFetch, webid);
      setMessages(fresh);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  async function handleEdit(m: ChatMessage, newBody: string) {
    if (!authFetch || !webid) return;
    if (m.author !== webid) {
      throw new Error("only the author can edit");
    }
    setError(null);
    try {
      await editMessage(DEMO_ROOM_URL, m.url, newBody, webid, authFetch);
      const fresh = await listTodayMessages(DEMO_ROOM_URL, authFetch, webid);
      setMessages(fresh);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  async function handleSend(body: string) {
    if (!authFetch || !webid) return;
    setError(null);
    try {
      await postMessage(DEMO_ROOM_URL, body, webid, authFetch);
      const fresh = await listTodayMessages(DEMO_ROOM_URL, authFetch, webid);
      setMessages(fresh);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }

  if (loading || !loggedIn) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--text-faint)]">
          // initializing
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen">
      <RoomSidebar
        meta={meta}
        messages={messages}
        members={members}
        selfWebid={webid}
        onSignOut={signOut}
        onInvite={handleInvite}
      />

      <section aria-label="Active room" className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--bg-1)]/60 px-5 py-3 backdrop-blur-md">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[color:var(--text-faint)]">#</span>
              <span className="text-sm font-semibold">{meta?.title?.toLowerCase() ?? "general"}</span>
              <span className="ml-2 hidden font-mono text-[9px] uppercase tracking-[0.25em] text-[color:var(--text-faint)] sm:inline">
                long-chat · ws2023
              </span>
            </div>
            <div
              className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]"
              data-testid="room-url"
            >
              {DEMO_ROOM_URL}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus state={connState} detail={error ?? undefined} />
            <span
              className="hidden font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)] sm:inline"
              data-testid="current-webid"
            >
              {webid ? shortName(webid) : ""}
            </span>
            <ThemeToggle />
          </div>
        </header>

        {error && connState !== "polling" ? (
          <div className="border-b border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-[color:var(--red)]">
            ⚠ {error}
          </div>
        ) : null}

        <MessageList
          messages={messages}
          selfWebid={webid}
          knownWebids={knownWebids}
          now={now}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onReact={handleReact}
        />

        <Composer onSend={handleSend} disabled={!authFetch} members={knownWebids} />
      </section>
    </main>
  );
}

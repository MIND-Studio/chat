"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@mind-studio/ui";
import { REACTION_EMOJI, type ChatMessage } from "@/lib/solid/chat";
import { absoluteTime, colorForKey, relativeTime, shortName } from "@/lib/util/format";
import { buildHandleMap } from "@/lib/util/mentions";
import { Avatar } from "./Avatar";
import { MessageBody } from "./MessageBody";

const GROUP_WINDOW_MS = 5 * 60_000;
const STICK_TO_BOTTOM_SLACK = 80;

export function MessageList({
  messages,
  selfWebid,
  knownWebids,
  now,
  onEdit,
  onDelete,
  onReact,
}: {
  messages: ChatMessage[];
  selfWebid: string | null;
  /** Everyone the room knows about — used to resolve @mentions in bodies. */
  knownWebids?: readonly string[];
  now: number;
  onEdit?: (m: ChatMessage, newBody: string) => Promise<void>;
  onDelete?: (m: ChatMessage) => Promise<void>;
  onReact?: (m: ChatMessage, emoji: string) => Promise<void>;
}): React.JSX.Element {
  const [pickerForUrl, setPickerForUrl] = useState<string | null>(null);
  // Resolve @mentions against the union of known members and message authors,
  // so a mention of someone who has posted resolves even before the (owner-
  // only) member list loads.
  const mentionMap = useMemo(() => {
    const all = new Set<string>(knownWebids ?? []);
    for (const m of messages) all.add(m.author);
    return buildHandleMap(all);
  }, [knownWebids, messages]);
  const selfHandle = selfWebid ? shortName(selfWebid) : null;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const [editingUrl, setEditingUrl] = useState<string | null>(null);
  // Count of messages that arrived while the reader was scrolled away from the
  // bottom — surfaced as a "jump to latest" pill so new transmissions aren't
  // missed without yanking the viewport. Cleared once the reader is back at
  // the bottom (either by scrolling there or via the pill).
  const [unseen, setUnseen] = useState(0);
  const hasMessages = messages.length > 0;

  // Re-bind on the empty→list transition: the scroller div only exists once
  // there are messages, so a one-shot `[]` effect would attach to the stale
  // empty-state node and never track the real scroller.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!el) return;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const stuck = distFromBottom < STICK_TO_BOTTOM_SLACK;
      stickRef.current = stuck;
      if (stuck) setUnseen((u) => (u === 0 ? u : 0));
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMessages]);

  useEffect(() => {
    const added = Math.max(0, messages.length - prevLenRef.current);
    prevLenRef.current = messages.length;
    if (stickRef.current) {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
      setUnseen((u) => (u === 0 ? u : 0));
    } else if (added > 0) {
      setUnseen((u) => u + added);
    }
  }, [messages]);

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setUnseen(0);
  }

  if (messages.length === 0) {
    return (
      <div
        ref={scrollerRef}
        className="flex flex-1 items-center justify-center px-6 text-center"
      >
        <div className="max-w-sm">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-faint)]">
            // signal idle
          </div>
          <p className="text-sm text-[color:var(--text-muted)]">
            no transmissions yet. open a channel — your message lands directly on the pod.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        data-testid="message-list"
      >
        <ul className="flex flex-col gap-0.5">
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : undefined;
          const newGroup =
            !prev ||
            prev.author !== m.author ||
            Date.parse(m.createdAtIso) - Date.parse(prev.createdAtIso) > GROUP_WINDOW_MS;
          const isMine = m.author === selfWebid;
          const accent = colorForKey(m.author);
          const isEditing = editingUrl === m.url;
          // Whether the *next* message opens a new group — used so a run of
          // own messages renders as one continuous tinted block (rounded only
          // at the group's top and bottom) rather than separate segments.
          const next = messages[i + 1];
          const lastInGroup =
            !next ||
            next.author !== m.author ||
            Date.parse(next.createdAtIso) - Date.parse(m.createdAtIso) > GROUP_WINDOW_MS;

          return (
            <li
              key={m.url}
              data-testid="message"
              className={`group flex gap-3 ${newGroup ? "mt-4" : isMine ? "mt-0" : "mt-px"}`}
            >
              <div className="w-9 shrink-0">
                {newGroup ? <Avatar webid={m.author} size={36} /> : null}
              </div>
              <div
                className={`min-w-0 flex-1 ${
                  isMine
                    ? `border-l-2 border-[color:var(--cyan)] bg-[color:var(--cyan-soft)] px-3 ${
                        newGroup ? "rounded-t-md pt-1.5" : "pt-0.5"
                      } ${lastInGroup ? "rounded-b-md pb-1.5" : "pb-0.5"}`
                    : ""
                }`}
              >
                {newGroup ? (
                  <div className="mb-1 flex items-baseline gap-2">
                    <span
                      className="author-color text-sm font-semibold"
                      style={{ "--author-color": accent } as React.CSSProperties}
                    >
                      {shortName(m.author)}
                      {isMine ? (
                        <span className="ml-1 font-mono text-[9px] font-normal uppercase tracking-widest text-[color:var(--text-faint)]">
                          [you]
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]"
                      title={absoluteTime(m.createdAtIso)}
                    >
                      {relativeTime(m.createdAtIso, now)}
                    </span>
                    {m.editedAtIso ? (
                      <span
                        className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]"
                        title={`edited ${absoluteTime(m.editedAtIso)}`}
                      >
                        · edited
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {m.deletedAtIso ? (
                  <div
                    data-testid="message-body"
                    className="italic text-[color:var(--text-faint)]"
                  >
                    // message deleted
                  </div>
                ) : isEditing && onEdit ? (
                  <EditInline
                    initial={m.body}
                    onCancel={() => setEditingUrl(null)}
                    onSave={async (next) => {
                      await onEdit(m, next);
                      setEditingUrl(null);
                    }}
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div
                      data-testid="message-body"
                      className="min-w-0 break-words text-sm"
                    >
                      <MessageBody body={m.body} mentions={mentionMap} selfHandle={selfHandle} />
                    </div>
                    {onEdit || onDelete || onReact ? (
                      <div className="hidden shrink-0 items-center gap-1 self-start group-hover:flex">
                        {onReact ? (
                          <div className="relative">
                            <Button
                              variant="ghost"
                              onClick={() => setPickerForUrl(pickerForUrl === m.url ? null : m.url)}
                              className="h-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 font-mono text-[9px] font-normal uppercase tracking-wider text-[color:var(--text-faint)] hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)]"
                              title="react"
                            >
                              ☺
                            </Button>
                            {pickerForUrl === m.url ? (
                              <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--glass-strong)] px-1.5 py-1 backdrop-blur-md">
                                {REACTION_EMOJI.map((e) => (
                                  <button
                                    key={e}
                                    onClick={async () => {
                                      setPickerForUrl(null);
                                      try {
                                        await onReact(m, e);
                                      } catch (err) {
                                        // eslint-disable-next-line no-console
                                        console.error("react failed", err);
                                      }
                                    }}
                                    className="text-base leading-none transition hover:scale-125"
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {isMine && onEdit ? (
                          <Button
                            variant="ghost"
                            onClick={() => setEditingUrl(m.url)}
                            className="h-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 font-mono text-[9px] font-normal uppercase tracking-wider text-[color:var(--text-faint)] hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)]"
                            title="edit"
                          >
                            edit
                          </Button>
                        ) : null}
                        {isMine && onDelete ? (
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              if (
                                typeof window !== "undefined" &&
                                !window.confirm("delete this message? this can't be undone in the UI.")
                              )
                                return;
                              try {
                                await onDelete(m);
                              } catch (err) {
                                // eslint-disable-next-line no-console
                                console.error("delete failed", err);
                              }
                            }}
                            className="h-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 font-mono text-[9px] font-normal uppercase tracking-wider text-[color:var(--text-faint)] hover:border-[color:var(--red)] hover:text-[color:var(--red)]"
                            title="delete"
                          >
                            delete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
                {m.reactions.length > 0 && !m.deletedAtIso ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.reactions.map((r) => {
                      const mineReacted = !!r.myReactionUrl;
                      return (
                        <button
                          key={r.emoji}
                          onClick={async () => {
                            if (!onReact) return;
                            try {
                              await onReact(m, r.emoji);
                            } catch (err) {
                              // eslint-disable-next-line no-console
                              console.error("react toggle failed", err);
                            }
                          }}
                          disabled={!onReact}
                          title={r.reactors.map(shortName).join(", ")}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                            mineReacted
                              ? "border-[color:var(--cyan)] bg-[color:var(--cyan-soft)] text-[color:var(--cyan)]"
                              : "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--text-muted)] hover:border-[color:var(--text-muted)]"
                          }`}
                        >
                          <span className="text-sm leading-none">{r.emoji}</span>
                          <span className="font-mono text-[10px]">{r.reactors.length}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              {!newGroup && !isEditing ? (
                <span
                  className="hidden w-14 shrink-0 self-start pt-px text-right font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)] group-hover:inline"
                  title={absoluteTime(m.createdAtIso)}
                >
                  {relativeTime(m.createdAtIso, now)}
                </span>
              ) : null}
            </li>
          );
        })}
        </ul>
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={jumpToLatest}
          data-testid="jump-to-latest"
          className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[color:var(--cyan)] bg-[color:var(--glass-strong)] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--cyan)] shadow-[var(--glow-cyan)] backdrop-blur-md transition hover:bg-[color:var(--cyan-soft)]"
        >
          <span aria-hidden>↓</span>
          {unseen} new {unseen === 1 ? "message" : "messages"}
        </button>
      ) : null}
    </div>
  );
}

function EditInline({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.setSelectionRange(draft.length, draft.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`;
  }, [draft]);

  async function save() {
    const next = draft.trim();
    if (!next || next === initial || busy) {
      if (next === initial) onCancel();
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("edit failed", err);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void save();
    }
  }

  return (
    <div className="glass rounded-lg p-2">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        rows={1}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[color:var(--text-faint)] disabled:opacity-50"
      />
      <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
        <span>enter ↵ save · esc cancel</span>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="h-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider hover:border-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          >
            cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => void save()}
            disabled={busy || draft.trim().length === 0 || draft.trim() === initial}
            className="h-auto rounded border border-[color:var(--cyan)] bg-[color:var(--cyan-soft)] px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider text-[color:var(--cyan)] hover:bg-[color:var(--cyan-soft)] enabled:hover:shadow-[var(--glow-cyan)] disabled:opacity-30"
          >
            save
          </Button>
        </div>
      </div>
    </div>
  );
}

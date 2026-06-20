"use client";

import { Button, Textarea } from "@mind-studio/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { MENTION_PREFIX_RE, matchMentions } from "@/lib/util/mentions";

const MAX_LEN = 4000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** The `@handle` the caret is currently inside, if any. */
type MentionDraft = { start: number; end: number; query: string };

export function Composer({
  onSend,
  disabled = false,
  members = [],
}: {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
  /** WebIDs the room knows about — drives @mention autocomplete. */
  members?: readonly string[];
}): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<MentionDraft | null>(null);
  const [hi, setHi] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const candidates = useMemo(
    () => (mention ? matchMentions(members, mention.query) : []),
    [mention, members],
  );
  const popupOpen = mention !== null && candidates.length > 0;
  const activeIdx = candidates.length ? Math.min(hi, candidates.length - 1) : 0;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`;
  }, [draft]);

  /** Recompute the active @mention token from the text up to the caret. */
  function syncMention(value: string, caret: number) {
    const m = MENTION_PREFIX_RE.exec(value.slice(0, caret));
    if (!m) {
      setMention(null);
      return;
    }
    setMention({ start: m.index, end: caret, query: m[1] ?? "" });
    setHi(0);
  }

  function applyMention(handle: string) {
    if (!mention) return;
    const insert = `@${handle} `;
    const next = draft.slice(0, mention.start) + insert + draft.slice(mention.end);
    setDraft(next.slice(0, MAX_LEN));
    setMention(null);
    const caret = mention.start + insert.length;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setDraft("");
    setMention(null);
    try {
      await onSend(body);
    } catch (err) {
      setDraft(body);
      // eslint-disable-next-line no-console
      console.error("send failed", err);
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // When the mention popup is open it owns the navigation keys.
    if (popupOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(candidates[activeIdx]!.handle);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void submit();
    }
  }

  const trimmedLen = draft.trim().length;
  const canSend = !disabled && !sending && trimmedLen > 0 && trimmedLen <= MAX_LEN;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="relative border-t border-[color:var(--border)] px-5 py-3"
    >
      {popupOpen ? (
        <ul
          className="absolute bottom-full left-5 z-20 mb-2 max-h-60 w-64 overflow-y-auto rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--glass-strong)] py-1 shadow-lg backdrop-blur-md"
          data-testid="mention-popup"
        >
          {candidates.map((c, idx) => (
            <li key={c.webid}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the textarea blurs.
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(c.handle);
                }}
                onMouseEnter={() => setHi(idx)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  idx === activeIdx
                    ? "bg-[color:var(--cyan-soft)] text-[color:var(--cyan)]"
                    : "text-[color:var(--text-muted)] hover:bg-[color:var(--glass-2)]"
                }`}
              >
                <span className="font-medium">@{c.handle}</span>
                <span className="ml-auto truncate font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  {hostOf(c.webid)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="glass flex items-end gap-2 rounded-xl px-3 py-2 transition focus-within:border-[color:var(--cyan)] focus-within:shadow-[var(--glow-cyan)]">
        <Textarea
          ref={taRef}
          value={draft}
          onChange={(e) => {
            const v = e.target.value.slice(0, MAX_LEN);
            setDraft(v);
            syncMention(v, e.target.selectionStart ?? v.length);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled || sending}
          rows={1}
          placeholder="Message #general"
          // Strip the design-system Textarea's own border/bg/ring/padding so it
          // reads as a borderless field inside chat's glassy composer shell.
          className="min-h-[20px] flex-1 resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none placeholder:text-[color:var(--text-faint)] focus-visible:ring-0 disabled:opacity-50 dark:bg-transparent"
          data-testid="compose-input"
        />
        <Button
          type="submit"
          variant="ghost"
          disabled={!canSend}
          className="h-auto rounded-md border border-[color:var(--cyan)] bg-[color:var(--cyan-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--cyan)] hover:bg-[color:var(--cyan-soft)] enabled:hover:shadow-[var(--glow-cyan)] disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="compose-send"
        >
          send
        </Button>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        <span>enter ↵ to send · shift+enter for newline</span>
        <span className={trimmedLen > MAX_LEN * 0.9 ? "text-[color:var(--magenta)]" : ""}>
          {trimmedLen}/{MAX_LEN}
        </span>
      </div>
    </form>
  );
}

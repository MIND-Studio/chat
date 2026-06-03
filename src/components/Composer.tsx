"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@mind-studio/ui";

const MAX_LEN = 4000;

export function Composer({
  onSend,
  disabled = false,
}: {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`;
  }, [draft]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setDraft("");
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
      className="border-t border-[color:var(--border)] px-5 py-3"
    >
      <div className="glass flex items-end gap-2 rounded-xl px-3 py-2 transition focus-within:border-[color:var(--cyan)] focus-within:shadow-[var(--glow-cyan)]">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={onKeyDown}
          disabled={disabled || sending}
          rows={1}
          placeholder="Message #general"
          className="min-h-[20px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[color:var(--text-faint)] disabled:opacity-50"
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

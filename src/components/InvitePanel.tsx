"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@mind-studio/ui";

export function InvitePanel({
  onInvite,
}: {
  onInvite: (webid: string) => Promise<void>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setDraft("");
      setStatus(null);
    }
  }, [open]);

  async function submit() {
    const webid = draft.trim();
    if (!webid || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await onInvite(webid);
      setStatus({ kind: "ok", text: `invited ${shortHost(webid)}` });
      setDraft("");
    } catch (err) {
      setStatus({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-auto w-full justify-start gap-2 rounded-md border border-dashed border-[color:var(--border-strong)] px-2.5 py-1.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-[color:var(--text-muted)] hover:border-[color:var(--cyan)] hover:text-[color:var(--cyan)] hover:shadow-[var(--glow-cyan)]"
      >
        <span className="text-[color:var(--cyan)]">+</span>
        invite by webid
      </Button>
    );
  }

  return (
    <div className="glass rounded-lg p-2.5">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
        <span>invite</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          className="size-5 text-[color:var(--text-faint)] hover:bg-transparent hover:text-[color:var(--text)]"
          aria-label="close"
        >
          ✕
        </Button>
      </div>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="https://pod/foo/profile/card#me"
        spellCheck={false}
        autoComplete="off"
        disabled={busy}
        className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-1)] px-2 py-1 font-mono text-[11px] outline-none placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--cyan)] disabled:opacity-50"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className={`font-mono text-[9px] uppercase tracking-wider ${
            status?.kind === "ok"
              ? "text-[color:var(--green)]"
              : status?.kind === "err"
                ? "text-[color:var(--red)]"
                : "text-[color:var(--text-faint)]"
          }`}
        >
          {status?.text ?? (busy ? "patching acl…" : "enter to grant read+append")}
        </span>
        <Button
          variant="ghost"
          onClick={() => void submit()}
          disabled={busy || !draft.trim()}
          className="h-auto rounded-md border border-[color:var(--cyan)] bg-[color:var(--cyan-soft)] px-2 py-0.5 font-mono text-[9px] font-normal uppercase tracking-wider text-[color:var(--cyan)] hover:bg-[color:var(--cyan-soft)] enabled:hover:shadow-[var(--glow-cyan)] disabled:opacity-30"
        >
          grant
        </Button>
      </div>
    </div>
  );
}

function shortHost(webid: string): string {
  try {
    const u = new URL(webid);
    const path = u.pathname.split("/").filter(Boolean)[0];
    return path ? `${path}@${u.host}` : u.host;
  } catch {
    return webid;
  }
}

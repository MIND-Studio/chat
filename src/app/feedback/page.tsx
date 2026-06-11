"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/solid/session";
import { feedbackInbox } from "@/lib/config";
import { readFeedback } from "@mind-studio/core/feedback";
import type { FeedbackEntry, Sentiment, FeedbackKind } from "@mind-studio/core/feedback";
import { ThemeToggle } from "@/components/theme-toggle";
import { shortName, relativeTime, absoluteTime } from "@/lib/util/format";
import { Button } from "@mind-studio/ui";

const FACE: Record<Sentiment, string> = { bad: "😞", meh: "😐", good: "🙂", love: "😍" };
const KIND_ICON: Record<FeedbackKind, string> = {
  bug: "🐞",
  idea: "💡",
  praise: "🎉",
  other: "💬",
};

export default function FeedbackInboxPage() {
  const { webid, loggedIn, loading, fetch: authFetch } = useSession();
  const router = useRouter();

  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Append-only inboxes return 401/403 on read to non-owners. Distinguish that
  // from a genuinely empty inbox so the empty state tells the truth.
  const [access, setAccess] = useState<"ok" | "denied">("ok");

  // Triage filters.
  const [kindFilter, setKindFilter] = useState<FeedbackKind | "all">("all");
  const [sentFilter, setSentFilter] = useState<Sentiment | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    if (!loading && !loggedIn) router.replace("/");
  }, [loading, loggedIn, router]);

  const load = useCallback(async () => {
    if (!authFetch) return;
    setBusy(true);
    setError(null);
    setAccess("ok");
    try {
      // Probe first: a non-owner gets 401/403 on the container (append-only),
      // which readFeedback would otherwise swallow into an empty list.
      const probe = await authFetch(feedbackInbox, { method: "GET" });
      if (probe.status === 401 || probe.status === 403) {
        setAccess("denied");
        setEntries([]);
        return;
      }
      const list = await readFeedback(feedbackInbox, authFetch);
      setEntries(list); // oldest → newest (readFeedback order); sort is applied in view
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const bySentiment: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const e of entries) {
      bySentiment[e.sentiment] = (bySentiment[e.sentiment] ?? 0) + 1;
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    }
    return { bySentiment, byKind, total: entries.length };
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = entries.filter((e) => {
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (sentFilter !== "all" && e.sentiment !== sentFilter) return false;
      if (q) {
        const hay = `${e.comment} ${e.route} ${e.webId ?? ""} ${e.clientErrors}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // `entries` is oldest → newest; flip for the default newest-first view.
    return sort === "newest" ? out.slice().reverse() : out;
  }, [entries, kindFilter, sentFilter, query, sort]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-feedback-${filtered.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeFilters = kindFilter !== "all" || sentFilter !== "all" || query.trim() !== "";

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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">feedback inbox</h1>
          <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
            {feedbackInbox}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="Toggle sort order"
                onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
              >
                {sort === "newest" ? "↓ newest" : "↑ oldest"}
              </Button>
              <Button variant="ghost" size="sm" title="Download as JSON" onClick={exportJson}>
                ⤓ export
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
            {busy ? "…" : "↻ Refresh"}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Stats */}
      <section className="mb-4 flex flex-wrap gap-2">
        <Stat label="total" value={stats.total} />
        {(["love", "good", "meh", "bad"] as Sentiment[]).map((s) =>
          stats.bySentiment[s] ? (
            <Stat key={s} label={`${FACE[s]} ${s}`} value={stats.bySentiment[s]} />
          ) : null,
        )}
      </section>

      {/* Filters */}
      {stats.total > 0 && (
        <section className="mb-5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
              all
            </FilterChip>
            {(["bug", "idea", "praise", "other"] as FeedbackKind[]).map((k) =>
              stats.byKind[k] ? (
                <FilterChip
                  key={k}
                  active={kindFilter === k}
                  onClick={() => setKindFilter(kindFilter === k ? "all" : k)}
                >
                  {KIND_ICON[k]} {k} ({stats.byKind[k]})
                </FilterChip>
              ) : null,
            )}
            <span className="mx-1 text-[color:var(--text-faint)]">·</span>
            {(["love", "good", "meh", "bad"] as Sentiment[]).map((s) =>
              stats.bySentiment[s] ? (
                <FilterChip
                  key={s}
                  active={sentFilter === s}
                  onClick={() => setSentFilter(sentFilter === s ? "all" : s)}
                >
                  {FACE[s]}
                </FilterChip>
              ) : null,
            )}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search comments, routes, authors, errors…"
            aria-label="Search feedback"
            data-testid="feedback-search"
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-1)] px-3 py-1.5 text-sm outline-none focus:border-[color:var(--cyan)]"
          />
        </section>
      )}

      {error && (
        <div className="mb-4 rounded border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-4 py-2 font-mono text-[11px] text-[color:var(--red)]">
          ⚠ {error}
        </div>
      )}

      {busy ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">
          // reading inbox…
        </p>
      ) : access === "denied" ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-12 text-center">
          <div className="text-3xl">🔒</div>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            You don&apos;t have read access to this inbox.
          </p>
          <p className="mt-1 font-mono text-[11px] text-[color:var(--text-faint)]">
            It&apos;s append-only: anyone can submit, but only the owner can read.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-12 text-center">
          <div className="text-3xl">📭</div>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">No feedback yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-10 text-center">
          <p className="text-sm text-[color:var(--text-muted)]">
            No matches for the current filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setKindFilter("all");
              setSentFilter("all");
              setQuery("");
            }}
            className="mt-2 font-mono text-[11px] uppercase tracking-wider text-[color:var(--cyan)] hover:underline"
          >
            clear filters
          </button>
        </div>
      ) : (
        <>
          {activeFilters && (
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
              showing {filtered.length} of {stats.total}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {filtered.map((e) => (
              <EntryCard key={e.id} e={e} />
            ))}
          </ul>
        </>
      )}

      <footer className="mt-10 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        <Link href="/chat" className="underline-offset-2 hover:text-[color:var(--cyan)] hover:underline">
          ← back to chat
        </Link>
      </footer>
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors " +
        (active
          ? "border-[color:var(--cyan)] bg-[color:var(--cyan)]/15 text-[color:var(--cyan)]"
          : "border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--cyan)]")
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--glass)] px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        {label}
      </span>{" "}
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function EntryCard({ e }: { e: FeedbackEntry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasDetail = !!(
    e.userAgent ||
    e.appVersion ||
    e.clientErrors ||
    e.screenshot ||
    e.target
  );

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(e, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <li className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-1)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-xl" title={e.sentiment}>
          {FACE[e.sentiment]}
        </span>
        <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {KIND_ICON[e.kind]} {e.kind}
        </span>
        {e.clientErrors && (
          <span
            className="rounded-full border border-[color:var(--red)]/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--red)]"
            title="Client errors attached"
          >
            🐞 error
          </span>
        )}
        {e.target && (
          <span
            className="rounded-full border border-[color:var(--cyan)]/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[color:var(--cyan)]"
            title={`Targets: ${e.target.selector}`}
          >
            🎯 {e.target.label}
          </span>
        )}
        <span
          className="ml-auto font-mono text-[10px] text-[color:var(--text-faint)]"
          title={e.createdAt ? absoluteTime(e.createdAt) : undefined}
        >
          {e.createdAt ? relativeTime(e.createdAt) : "unknown time"}
        </span>
      </div>

      {e.comment ? (
        <p className="mt-2 whitespace-pre-wrap text-sm">{e.comment}</p>
      ) : (
        <p className="mt-2 text-sm italic text-[color:var(--text-faint)]">(no comment)</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-[color:var(--text-faint)]">
        {e.route && <span>route: {e.route}</span>}
        <span>by: {e.webId ? shortName(e.webId) : "anonymous"}</span>
        {e.viewport && <span>{e.viewport}</span>}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={copyJson}
            className="uppercase tracking-wider hover:text-[color:var(--cyan)]"
          >
            {copied ? "copied ✓" : "copy json"}
          </button>
          {hasDetail && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="uppercase tracking-wider hover:text-[color:var(--cyan)]"
            >
              {open ? "less ▲" : "details ▾"}
            </button>
          )}
        </span>
      </div>

      {open && hasDetail && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-[color:var(--border)] pt-3 font-mono text-[10px] text-[color:var(--text-muted)]">
          {e.webId && (
            <>
              <dt className="text-[color:var(--text-faint)]">webid</dt>
              <dd className="break-all">{e.webId}</dd>
            </>
          )}
          {e.appVersion && (
            <>
              <dt className="text-[color:var(--text-faint)]">version</dt>
              <dd>{e.appVersion}</dd>
            </>
          )}
          {e.userAgent && (
            <>
              <dt className="text-[color:var(--text-faint)]">agent</dt>
              <dd className="break-all">{e.userAgent}</dd>
            </>
          )}
          {e.screenshot && (
            <>
              <dt className="text-[color:var(--text-faint)]">shot</dt>
              <dd>
                <a
                  href={e.screenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[color:var(--cyan)] underline"
                >
                  open screenshot
                </a>
              </dd>
            </>
          )}
          {e.target && (
            <>
              <dt className="text-[color:var(--text-faint)]">element</dt>
              <dd className="break-all">
                🎯 {e.target.label}
                <span className="opacity-60"> — {e.target.selector}</span>
                {e.target.text ? (
                  <span className="opacity-60"> · “{e.target.text}”</span>
                ) : null}
                <span className="opacity-50">
                  {" "}
                  · {e.target.rect.w}×{e.target.rect.h} @ {e.target.rect.x},
                  {e.target.rect.y}
                </span>
              </dd>
            </>
          )}
        </dl>
      )}

      {open && e.clientErrors && (
        <pre className="mt-2 overflow-x-auto rounded bg-[color:var(--bg-2)] p-2 font-mono text-[10px] text-[color:var(--red)]">
          {e.clientErrors}
        </pre>
      )}
    </li>
  );
}

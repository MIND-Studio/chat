"use client";

import { colorForKey, shortName } from "@/lib/util/format";
import type { Participant } from "@/lib/util/participants";
import { Avatar } from "./Avatar";

/**
 * The members `<ul>` shared by the desktop sidebar and the mobile members sheet.
 * Keeping the row markup in one place means both surfaces stay identical.
 */
export function MemberList({
  participants,
  selfWebid,
  creator,
}: {
  participants: readonly Participant[];
  selfWebid: string | null;
  creator?: string;
}): React.JSX.Element {
  return (
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
                <span
                  className="author-color"
                  style={{ "--author-color": accent } as React.CSSProperties}
                >
                  {shortName(p.webid)}
                </span>
                {p.webid === selfWebid ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-faint)]">
                    [you]
                  </span>
                ) : null}
                {p.webid === creator ? (
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
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

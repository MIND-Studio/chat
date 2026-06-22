import { Badge } from "@mind-studio/ui";

export type ConnState = "connecting" | "connected" | "polling" | "error";

export function ConnectionStatus({
  state,
  detail,
}: {
  state: ConnState;
  detail?: string;
}): React.JSX.Element {
  const { color, label, dotClass, ringClass } = describe(state);
  return (
    <Badge
      variant="outline"
      role="status"
      aria-live="polite"
      className="gap-1.5 border-[color:var(--border)] bg-transparent px-2 py-0.5 text-[10px] font-normal uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
      title={detail ?? label}
    >
      <span className="sr-only">Connection: </span>
      <span className="relative inline-flex size-2.5 items-center justify-center">
        {ringClass ? (
          <span
            aria-hidden
            className={`absolute inset-[-3px] rounded-full border border-dashed ${ringClass}`}
            style={{ borderColor: color }}
          />
        ) : null}
        <span
          aria-hidden
          className={`size-2 rounded-full ${dotClass}`}
          style={{
            background: color,
            boxShadow: `0 0 10px ${color}, 0 0 2px ${color}`,
          }}
        />
      </span>
      <span>{label}</span>
    </Badge>
  );
}

function describe(state: ConnState): {
  color: string;
  label: string;
  dotClass: string;
  ringClass?: string;
} {
  switch (state) {
    // Colors route through brand tokens: the accent (`--cyan` aliases
    // `--primary`) for linking, charts for live/polling, destructive for
    // offline — so they follow Mind by default and the deepspace opt-in.
    case "connecting":
      return { color: "var(--cyan)", label: "linking", dotClass: "", ringClass: "spin-ring" };
    case "connected":
      return { color: "var(--chart-1)", label: "live", dotClass: "pulse-green" };
    case "polling":
      return { color: "var(--chart-4)", label: "polling", dotClass: "" };
    case "error":
      return { color: "var(--destructive)", label: "offline", dotClass: "" };
  }
}

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
    <div
      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
      title={detail ?? label}
    >
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
    </div>
  );
}

function describe(state: ConnState): {
  color: string;
  label: string;
  dotClass: string;
  ringClass?: string;
} {
  switch (state) {
    case "connecting":
      return { color: "#5ce1ff", label: "linking", dotClass: "", ringClass: "spin-ring" };
    case "connected":
      return { color: "#6cf0a0", label: "live", dotClass: "pulse-green" };
    case "polling":
      return { color: "#ffce6b", label: "polling", dotClass: "" };
    case "error":
      return { color: "#ff7a85", label: "offline", dotClass: "" };
  }
}

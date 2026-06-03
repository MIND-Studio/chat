import { colorForKey, initials, shortName } from "@/lib/util/format";

export function Avatar({
  webid,
  size = 36,
  title,
}: {
  webid: string;
  size?: number;
  title?: string;
}): React.JSX.Element {
  const name = shortName(webid);
  const accent = colorForKey(webid);
  return (
    <div
      title={title ?? webid}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}cc 70%)`,
        boxShadow: `0 0 0 1px ${accent}55, 0 0 14px ${accent}55`,
      }}
      className="relative flex shrink-0 items-center justify-center rounded-full font-semibold text-black"
    >
      <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
    </div>
  );
}

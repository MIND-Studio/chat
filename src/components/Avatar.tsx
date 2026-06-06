import { Avatar as UIAvatar, AvatarFallback } from "@mind-studio/ui";
import { colorForKey, initials, shortName } from "@/lib/util/format";

/**
 * Per-identity avatar. Rides the `@mind-studio/ui` `Avatar`/`AvatarFallback`
 * primitives (Radix under the hood) but keeps chat's signature per-WebID
 * gradient fill + glow: the colour is derived from the WebID (`colorForKey`)
 * and the initials sit on a radial-gradient disc. No `AvatarImage` — Solid
 * profiles aren't fetched here, so the fallback always renders.
 */
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
    <UIAvatar
      title={title ?? webid}
      style={{ width: size, height: size }}
      className="shrink-0"
    >
      <AvatarFallback
        style={{
          background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}cc 70%)`,
          boxShadow: `0 0 0 1px ${accent}55, 0 0 14px ${accent}55`,
          fontSize: size * 0.4,
        }}
        className="font-semibold text-black"
      >
        {initials(name)}
      </AvatarFallback>
    </UIAvatar>
  );
}

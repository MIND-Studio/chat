/**
 * Runtime config sourced from NEXT_PUBLIC_* env vars. Next.js inlines these
 * at build time, so changing them requires restarting the dev server.
 */

export const oidcIssuer =
  process.env.NEXT_PUBLIC_SOLID_ISSUER ?? "https://pod.mindpods.org/";

export const roomUrl =
  process.env.NEXT_PUBLIC_ROOM_URL ??
  "http://localhost:3031/alice/chat/general";

export const personaAName = process.env.NEXT_PUBLIC_PERSONA_A_NAME ?? "Alice";
export const personaBName = process.env.NEXT_PUBLIC_PERSONA_B_NAME ?? "Bob";

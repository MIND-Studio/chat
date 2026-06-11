/**
 * Runtime config sourced from NEXT_PUBLIC_* env vars. Next.js inlines these
 * at build time, so changing them requires restarting the dev server.
 */

export const oidcIssuer =
  process.env.NEXT_PUBLIC_SOLID_ISSUER ?? "https://pods.mindpods.org/";

export const roomUrl =
  process.env.NEXT_PUBLIC_ROOM_URL ??
  "http://localhost:3011/alice/chat/general";

/**
 * App-owned feedback inbox (public-append container the app developer controls).
 * All feedback — from any user, logged in or not — is POSTed here, and the dev
 * reads it from this one place. See `@mind-studio/core/feedback`.
 */
export const feedbackInbox =
  process.env.NEXT_PUBLIC_FEEDBACK_INBOX ??
  "http://localhost:3011/alice/chat-feedback/";

export const personaAName = process.env.NEXT_PUBLIC_PERSONA_A_NAME ?? "Alice";
export const personaBName = process.env.NEXT_PUBLIC_PERSONA_B_NAME ?? "Bob";

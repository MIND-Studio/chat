<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mind-chat-rules -->
# chat — agent rules

This prototype runs on Solid pods. **Never invent a central database for users, chat rooms, messages, or membership.** A chat room is a Solid container; a message is an RDF resource inside it; access control is WAC. The Next.js app is a thin client + a few API routes that proxy to pods on behalf of the browser. There is no `messages` table anywhere on the server.

**Storage layout is the [SolidOS long-chat spec](https://solid.github.io/chat/).** Each room has an `index.ttl` containing `<#this> a meeting:LongChat`, and messages live in `chat/YYYY/MM/DD/chat.ttl` (UTC date) on the room owner's pod. Adopt the existing predicates (`meeting:message`, `sioc:content`, `foaf:maker`, `dct:created`, `dct:isReplacedBy`, `sioc:has_reply`, `schema:LikeAction`) — do not invent a parallel vocabulary. Interop with SolidOS chat-pane is a free bonus and a useful sanity check.

**Real-time = WebSocketChannel2023 via `@inrupt/solid-client-notifications` v4.** Subscribe to today's chat container; on each `Add` notification, GET the new resource. CSS v7 supports container subscriptions out of the box. Polling fallback on socket drop is a 2-second `setInterval` re-listing the container — that's fine, every prior Solid chat shipped with polling.

**Never log:** message bodies, capability tokens, attachment URIs, room participant lists, or raw LDN payloads. OK to log: WebID, room URL (path only, no query), route, status, latency, error code, high-level event type (e.g. `"chat.message.added"` with no body).

**Sibling stack lock:** Mirror `mind-social-network-v0` patterns for Next.js + Inrupt + better-sqlite3 + Tailwind v4 + Docker. The DM module in `mind-social-network-v0/src/lib/solid/dm.ts` is the closest reference and many patterns port directly — but **diverge** on storage layout (use the long-chat spec, not the per-thread `/dms/{id}/messages/` container the social-network prototype uses, since the long-chat spec gives us interop + edits + reactions + threading for free).

**The indexer is optional and tiny.** If you add one, it caches only PUBLIC data: room directory for discoverable rooms, member count, last-active timestamp. **Never cache message bodies or membership lists for private rooms.** Default to no indexer for v0 — add one only when a feature genuinely needs it (e.g. a public-rooms directory).

**E2EE is novel territory.** No drop-in Solid E2EE library exists. If you implement it (post-MVP feature in `docs/PRD.md` §What we defer), put the X25519 pubkey in the WebID profile, do libsodium sealed-boxes in the browser, and store ciphertext as `sioc:content`. Do not invent a key exchange protocol; reuse the sealed-box primitive.

**One pod for v0, two pods for the demo.** The v0 design assumes both chatters' pods are on the same CSS instance — same OIDC issuer, no cross-server federation. The docker-compose ships **two** CSS instances (alice + bob, ports 3031 and 3032) so cross-pod chat is demonstrable, but the cross-server federation path (UMA tokens, recipient inbox grants on a foreign pod) is explicitly deferred.

**Presence is not a protocol primitive.** If a feature asks for "online status," push back to the spec — Solid has no presence layer. The acceptable substitute is a per-user `presence.ttl` with `dct:modified` heartbeats; "online" = modified in the last 60s. Anything fancier needs an explicit design discussion before coding.
<!-- END:mind-chat-rules -->

# Privacy-First Chat — Pod-Native Messaging MVP PRD

_(A chat app where the rooms, the messages, and the membership lists live in your Solid pod — not in a platform's database. The "server" is just a few API routes and a static frontend. Real-time delivery happens by subscribing to your friend's pod, not by polling our backend.)_

## What this MVP proves

Three claims, all testable end-to-end:

1. **Real chat — rooms, messages, edits, reactions, threading — can run on Solid pods with no bespoke schema.** The [SolidOS long-chat spec](https://solid.github.io/chat/) is the de facto interop layer; we adopt it verbatim. Same architectural bet as the sibling prototypes, applied to the message-stream data shape.
2. **Real-time on Solid is shippable today.** WebSocketChannel2023 container subscriptions in Community Solid Server v7 plus `@inrupt/solid-client-notifications` v4 give push-based UI updates with ~50–200 ms latency. Polling is the fallback, not the primary path. This deliberately tests whether the notifications protocol is production-ready in 2026.
3. **The platform stays tiny — or absent.** No central message store, no central membership store, no chat server. Optional thin indexer (public-rooms directory only). Everything load-bearing lives on user pods.

This is the smallest thing you can ship that's _real_ chat (not a "your own private notebook of messages" demo). Two-pod from day one — the cross-pod path is the one that matters.

## The model in one sentence

A chat room is a Solid container on someone's pod. Messages are append-only RDF resources inside it, partitioned by UTC day per the long-chat spec. Membership is WAC ACL on the container. Real-time delivery is a WebSocket subscription on the container; on each `Add` notification the client GETs the new resource. No `chat_messages` table exists anywhere.

## The shape of the graph

- **A room lives on one pod.** The room's owner (creator) hosts it; their pod is the source of truth. Other members are granted `acl:Read` (read-only rooms) or `acl:Read`+`acl:Append` (writable rooms) on the room container.
- **Messages are immutable resources.** Each message is `chat/YYYY/MM/DD/chat.ttl#msg-<ulid>` on the room owner's pod. Edits are modeled via `dct:isReplacedBy` chains; deletes via `schema:dateDeleted` (soft delete). This is the long-chat spec's existing pattern — we get edits, deletes, threading, and reactions for free.
- **DMs are just rooms with two members.** No separate DM data model. The UI surfaces a "Direct Messages" view by filtering rooms with exactly two members where one is the current user, but on the pod a DM is structurally identical to a small group room.
- **Membership is ACL, not a list.** "Who is in this room" = read the ACL of the room container. We don't maintain a parallel members list. The downside is iterating ACL agents is slower than a member-list resource — acceptable for v0; revisit if room sizes grow.

## Scope: what's in

### Identity

- Solid WebID authentication (`@inrupt/solid-client-authn-browser`), standard OIDC flow against either CSS instance.
- Profile rendering from `/profile/card` (display name, avatar). Profiles are public; that's the point.
- No platform user account. Identity = WebID.

### Rooms

- Create a room. Browser writes `chat/<room-slug>/index.ttl` to the creator's pod with `<#this> a meeting:LongChat ; dct:title "..." ; dct:created "..."^^xsd:dateTime`. The creator gets `acl:Control`.
- Invite a member. Browser updates the room container's ACL to grant the invitee's WebID `acl:Read`+`acl:Append`, then POSTs an LDN invitation to the invitee's pod inbox referencing the room URL.
- Accept an invite. The invitee's client picks up the LDN, writes a pointer to the room in their own `chat/index.ttl` (their "rooms I'm in" list), and the room appears in their sidebar.
- Leave a room. The room owner removes the leaver's WebID from the ACL. The leaver's client drops the room from their index.
- Delete a room. Only the owner. Removes the container and all daily message files.

### Messages

- Compose a message: plain text up to 4000 chars + optional single image (uploaded to room owner's pod under `chat/<room>/uploads/`).
- Publish. Browser PATCHes today's `chat/<room>/YYYY/MM/DD/chat.ttl` with a SPARQL `INSERT` adding the new `meeting:message` triple plus the message resource (`sioc:content`, `foaf:maker`, `dct:created`). If today's file doesn't exist, PUT it first.
- Edit a message. PATCH adds a `dct:isReplacedBy` triple on the old resource and inserts the replacement. UI renders the latest in the chain; "edited" tag is visible on hover.
- Delete a message. PATCH sets `schema:dateDeleted`. UI renders a tombstone (`"This message was deleted"`); the resource itself stays so threading anchors don't break.
- React to a message. Append a `schema:LikeAction` (or one of the 6 fixed emoji predicates) resource referencing the target message. The reaction is owned by the reactor's WebID — though it's written to the room owner's pod, which is structurally awkward and tracked as a known limitation (see Risks).
- Reply to a message. New message with `sioc:has_reply` referencing the parent. Threading is one level deep (like the social-network's reply model), no nested reply chains.

### Real-time delivery

- On opening a room, subscribe to its current-day container via WebSocketChannel2023. The container subscription fires `Add` notifications when new message resources appear; on each `Add`, GET the new resource.
- At UTC midnight, drop the old subscription and open one on the new day's container. The client also keeps a subscription on the room's root container for cross-day events (new daily file creation).
- If the socket drops or fails to open, fall back to a 2-second `setInterval` re-list of the current day's container. Honest, simple, prior-art.
- Subscriptions auto-expire after 2 weeks per CSS v7 default; the client re-subscribes on a 1-week timer.

### Direct messages

- A DM is just a 2-member room with a UI affordance. Same storage, same ACL, same subscription model. The "DMs" tab is a client-side filter.
- The DM is hosted on whichever pod created it (typically the initiator's).

### Notifications

- The pod inbox (`/inbox/`) is the canonical out-of-band notification stream for room invites and mentions. The frontend renders it as a notification feed.
- In-room real-time updates do NOT use the inbox; they use the WebSocket subscription on the room container. The inbox is for out-of-band signals only.

### The (optional, deferred-to-v1) thin platform

- No backend in v0 beyond a Next.js app that's mostly a static client. The frontend talks directly to pods.
- If we later add an indexer, it caches only public-room metadata: room URL, title, description, member count, last-active timestamp. **Never message bodies, never membership lists for private rooms.**

## Scope: deliberately out

- Cross-server federation. Both demo personas (alice, bob) live on different CSS instances in our demo, but **they share the same Next.js client and we treat both CSS issuers as trusted in the dev OIDC config**. True foreign-pod chat (alice on `solidcommunity.net`, bob on `inrupt.net`) needs UMA tokens and cross-server inbox-write grants; deferred to v1.
- E2E encryption. There is no shippable Solid E2EE library. The position-piece [Inrupt E2E blog](https://www.inrupt.com/blog/solid-e2e) is not a spec. If we ship E2EE later (it's an obvious differentiator), the design is: X25519 pubkey in WebID, libsodium sealed-boxes in browser, ciphertext as `sioc:content`. Out of v0 scope.
- Presence ("Alice is online"). Solid has no presence primitive. The minimum honest substitute is a per-user `presence.ttl` with `dct:modified` heartbeats; deferred to v1.
- Typing indicators and read receipts. Both would require ephemeral writes per keystroke / per render, which the long-chat spec doesn't support and which would balloon pod write volume. Out.
- Voice, video, file attachments beyond a single image, voice notes, screen sharing. Out.
- Push notifications to mobile. Web-Push-from-Solid is research-only (KIT 2022). Out.
- Search across rooms. A future indexer feature; out of v0.
- Native mobile apps.
- Multi-language UI (English only).
- Moderation tooling beyond room-owner kick + per-user mute. Out — this is a friend-graph chat, not a Discord competitor.
- Anti-spam for the public inbox. Known unsolved Solid problem (see [spec discussion #549](https://github.com/solid/specification/discussions/549)). For v0 the demo personas trust each other.

## Architecture

```
   Alice's pod (CSS, localhost:3031)         Bob's pod (CSS, localhost:3032)
   ├── /profile/card                         ├── /profile/card
   ├── /inbox/                               ├── /inbox/
   ├── /chat/index.ttl                       ├── /chat/index.ttl  ← rooms I'm in
   └── /chat/general/                        │
       ├── index.ttl  ← <#this> a            │   (Bob has no rooms he owns yet —
       │                meeting:LongChat     │    he's a member of Alice's
       ├── 2026/05/26/chat.ttl  ← today      │    /chat/general/ via ACL)
       ├── 2026/05/25/chat.ttl  ← yesterday  │
       ├── uploads/                          │
       └── .acl   ← grants Bob R+Append      │

                ▲   ▲                              ▲
                │   │                              │
                │   │ HTTP read/write              │ HTTP read/write
                │   │ WebSocketChannel2023         │ (Bob's client to
                │   │ subscription on              │  Alice's pod)
                │   │ /chat/general/2026/05/26/    │
                │   │                              │
                ▼   ▼                              │
       ┌──────────────────────────────────────────────────┐
       │  mind-chat-v0 frontend (Next.js, localhost:3030) │
       │   - sidebar of rooms (from each user's           │
       │     /chat/index.ttl)                             │
       │   - active room view (subscribed via WS)         │
       │   - compose box (PATCHes today's chat.ttl)       │
       │   - profile / WebID picker                       │
       └──────────────────────────────────────────────────┘
                          ▲
                          │ (browser is the client; the
                          │  Next.js server hosts the static
                          │  app + a handful of API routes
                          │  for things that need server-side
                          │  auth, e.g. LDN inbox webhook)
                          │
       ┌──────────────────┴─────────────────┐
       │  Next.js server (optional, thin)   │
       │   - /api/ldn/inbox  (receive LDN   │
       │     for client when offline —      │
       │     stored in user's pod inbox     │
       │     via signed request, NOT in     │
       │     a central table)               │
       └────────────────────────────────────┘
```

**Key properties:**

- **Source of truth for messages, edits, deletes, reactions, and membership is the room owner's pod.** No central store.
- **Real-time = WebSocketChannel2023 on the current-day container.** Polling is the fallback.
- **Pod-to-pod LDN is the glue for out-of-band signals** (room invites, mentions, the recipient-isn't-currently-watching-this-room case).
- **The Next.js app is almost entirely a static client.** The few API routes are conveniences (LDN inbox forwarding, image upload proxying); none own data.

## The full user flows

### Onboarding

1. Land on site. Static page explains the model: "Your messages live in your pod. We're just the chat UI."
2. Sign in. WebID OIDC against either CSS instance (the demo personas live on alice@3031 and bob@3032; production users bring their own WebID).
3. If first time on this WebID, the app provisions:
   - `/chat/index.ttl` (your "rooms I'm in" list — empty to start)
   - Confirms `/inbox/` exists (CSS doesn't auto-create it; the app PUTs it if missing and patches the WebID profile to add `ldp:inbox`).
4. Pick a display name. Saved to `/profile/card`.

### Create a room

1. Click "New room." Pick a slug (`general`), title (`General Chat`), and members (paste WebID URLs or pick from your previous chats).
2. Browser writes `/chat/<slug>/index.ttl` to your pod with `<#this> a meeting:LongChat ; dct:title "..." ; dct:created "<now>"^^xsd:dateTime`.
3. Browser writes the ACL: owner = `acl:Control`, each member WebID = `acl:Read`+`acl:Append`.
4. Browser POSTs an LDN invitation to each member's pod inbox. Payload is AS2 `as:Invite { object: { type: "Place", url: "<room-url>" } }` per the [LDN](https://www.w3.org/TR/ldn/) spec.
5. Browser updates your `/chat/index.ttl` to add the new room.
6. The room appears in your sidebar.

### Send a message

1. Type into the compose box. Hit Enter.
2. Browser checks whether today's `chat/<room>/YYYY/MM/DD/chat.ttl` exists. If not, PUT it with an empty long-chat document.
3. Browser PATCHes today's file with SPARQL `INSERT`:
   ```sparql
   INSERT DATA {
     <#this> meeting:message <#msg-<ulid>> .
     <#msg-<ulid>>
       sioc:content "Hello world" ;
       foaf:maker <https://alice.example/profile/card#me> ;
       dct:created "2026-05-26T14:33:21Z"^^xsd:dateTime .
   }
   ```
4. CSS emits an `Add` notification on the day-container subscription. Every connected member's client receives it, GETs the new message resource, renders it.
5. Optimistic UI: the sender's client adds the message immediately and reconciles when the round-trip completes.

### Receive a message in real-time

1. On opening room `X`, client computes today's UTC date and POSTs a WebSocketChannel2023 subscription to the storage's notification endpoint with `topic = <room>/<YYYY>/<MM>/<DD>/`.
2. Subscription response includes `receiveFrom`; client opens the WebSocket.
3. On `Add` notification: extract the new resource URL, GET it, parse the long-chat triples, render.
4. On `Remove` notification: rare (we soft-delete, not hard-delete) — render as tombstone.
5. On `Update` notification on an existing message: re-GET, render the edited version.
6. At UTC midnight: open subscription on the new day's container; close yesterday's.

### Edit / delete a message

- Edit: PATCH today's chat.ttl with `<old-msg> dct:isReplacedBy <new-msg> .` plus the new message resource. UI walks the chain to display the latest version with an "edited" tag.
- Delete: PATCH adds `<msg> schema:dateDeleted "<now>"^^xsd:dateTime .`. UI renders a tombstone.

### React to a message

- Append a `<msg-<ulid>-reaction-<reactor-hash>>` resource to today's chat.ttl with `schema:LikeAction` (or `schema:DislikeAction` / one of 6 emoji predicates), `dct:created`, and `foaf:maker` = reactor WebID.
- Counts are aggregated client-side from the loaded message history. If we later add an indexer, it can cache reaction counts per public room.

### Invite + accept

1. Inviter's flow: see "Create a room" above (step 4 handles invites).
2. Invitee's client: on opening the app, fetches `/inbox/` from their pod. For each AS2 `as:Invite` payload referencing a chat room, render an "X invited you to room Y" notification in the sidebar.
3. Click "Accept." Browser writes a pointer to the room URL into the invitee's `/chat/index.ttl`. The room appears in the sidebar. (No second confirmation back to the inviter is needed — the ACL grant from step 3 of "Create a room" is already in place.)
4. Click "Decline." Browser removes the LDN notification resource from the inbox; no other action.

### Auto-purge

- LDN notifications older than 30 days in the inbox are dropped client-side on inbox-open.
- Daily chat files are never auto-purged — they're the user's record.
- Subscriptions are re-issued on a 1-week timer to stay ahead of CSS's 2-week auto-expiry.

## Data model — every field justified

**Room owner's pod:**

- `/chat/index.ttl` — list of rooms you participate in: `<#room1> rdfs:label "..." ; chat:roomUrl <...> ; chat:lastSeen "<timestamp>"^^xsd:dateTime`
- `/chat/<slug>/index.ttl` — room descriptor: `<#this> a meeting:LongChat ; dct:title "..." ; dct:created "..." ; dct:creator <webid> ; rdfs:comment "..."`
- `/chat/<slug>/.acl` — WAC ACL granting members read/append, owner control
- `/chat/<slug>/YYYY/MM/DD/chat.ttl` — daily message file containing `<#this> a meeting:LongChat` and N `meeting:message` references, plus the message resources inline
- `/chat/<slug>/uploads/<media-id>` — uploaded images
- `/inbox/` — incoming LDN notifications: room invites, mentions, optionally per-message notifications when subscribing-on-every-room is too expensive

**Indexer (deferred to v1; described here for future reference):**

- `PublicRoom`: room URL, owner WebID, title, description, member_count, last_active_at, registered_at
- `RoomMembership` (only for rooms whose owner has opted-in to public-listing): WebID, room URL
- **Never:** message bodies, private room membership, reactions, edits, deletes

Notice what isn't there: no central message table, no central membership table, no central reactions table, no `user_id` separate from WebID. The SQLite schema for v0 has zero tables.

## Privacy guarantees specific to the MVP

Promised in the docs and enforced in code:

1. **No central message store.** Every message body lives on a pod. The app's server has no access to message contents.
2. **No central membership store.** Room membership is WAC ACL on the room container; the app reads it on demand and never persists it.
3. **The inbox holds only signals, never bodies.** LDN invites reference room URLs; clicking the invite triggers an authenticated GET against the room owner's pod, which enforces ACL.
4. **No analytics, no telemetry.** No third-party trackers, no error-tracking SaaS. App logs (Pino) record only WebID, route, status, latency, error code, and high-level event type. Message bodies, room URLs with query strings, and capability tokens are never logged.
5. **Auto-expire LDN notifications older than 30 days client-side.** Inbox is not a permanent record.
6. **No email collected at signup.** Identity = WebID; recovery is the WebID's own OIDC flow.
7. **If we ever add an indexer, its data is public.** Only public-room metadata; source code and full DB export published.

## Build phases

Realistically, this is **3–4 weeks of focused work for one developer.** The data model is the long-chat spec (pre-existing); the auth flow is a port of `mind-social-network-v0`; the WebSocket layer is the novel piece but `@inrupt/solid-client-notifications` v4 does the heavy lifting.

**Week 1 — Foundation**
Stand up two CSS instances (alice, bob) mirroring `mind-social-network-v0`'s docker-compose. Next.js app with WebID OIDC login. Profile rendering. `/chat/index.ttl` provisioning on first sign-in. Sidebar showing rooms (still empty).

**Week 2 — Rooms, messages, real-time**
Create-room flow (writes container + ACL + invites). Compose box (PATCH today's chat.ttl). WebSocketChannel2023 subscription on current-day container; on `Add`, GET and render. Polling fallback. Day rollover at UTC midnight.

**Week 3 — Edits, deletes, reactions, threading, DMs**
Long-chat edit chain (`dct:isReplacedBy`). Soft-delete tombstones. Six emoji reactions. One-level threading (`sioc:has_reply`). DM filter view. Image upload to `uploads/`.

**Week 4 — Inbox, polish, seed, deploy**
LDN inbox handler (receive invites, render in sidebar). Accept/decline flow. Seed script provisioning alice + bob with a `general` room and demo conversation. Transparency page documenting what the app stores. Production docker-compose with Caddy. End-to-end smoke test (alice posts, bob sees it within 500 ms).

If you need to cut: reactions and edits ship later. Threading can ship later. Don't cut WebSocketChannel2023 — it's the headline technical bet. Don't cut the two-pod demo — single-pod-only would not prove the architecture.

## Tech stack

This prototype matches the sibling stack used in `mind-market-v0`, `mind-codespaces-v0`, `mind-os-v0`, and `mind-social-network-v0` so the prototypes share infrastructure and a single WebID can move between them.

- **Pod server:** [CommunitySolidServer](https://github.com/CommunitySolidServer/CommunitySolidServer) v7. Two instances (alice on 3031, bob on 3032) for the dev environment.
- **Frontend:** Next.js 16.2.6 + React 19.2.4 + TypeScript (App Router; SSR for shareable public-room landing pages).
- **Styling:** Tailwind v4 (`@tailwindcss/postcss`, no config file).
- **Solid client:** `@inrupt/solid-client` ^3.0.0, `@inrupt/solid-client-authn-browser` ^4.0.0, `@inrupt/solid-client-authn-node` ^3.1.1.
- **Solid notifications:** **`@inrupt/solid-client-notifications` ^4.0.0** (released 2025-11-03, Node 20+). Provides `WebsocketNotification` wrapping the storage-discovery → subscription-POST → WebSocket dance.
- **RDF parsing:** Whatever `@inrupt/solid-client` ships with for SPARQL UPDATE patches. We do NOT add a separate RDF library — the dependency footprint stays tight.
- **Indexer (deferred to v1):** Next.js API routes + `better-sqlite3`, public-room directory only.
- **Scripts:** `tsx` for seed/smoke (same as siblings).
- **UI primitives:** Radix headless (Dialog, Tabs, Popover, Toast, Tooltip) — same set as `mind-social-network-v0`.
- **Hosting:** plain Docker on a single VM, fronted by Caddy with auto-Let's-Encrypt. Same production pattern as siblings.
- **Email:** none.
- **Telemetry:** none.

## Risks worth naming

- **Reaction provenance.** When Bob reacts to Alice's message, the reaction resource is written to Alice's pod (the room owner's pod) because that's where the message is. This means Alice's pod technically holds Bob's `foaf:maker` triple — fine for v0 but not what we'd want for an audit-strict design. Acceptable for a friend-graph chat; revisit if we ever ship reactions for adversarial-trust rooms.
- **Two PATCH conflict on today's chat.ttl.** Two clients PATCHing the same daily file simultaneously can race; CSS doesn't expose conditional-write ETags reliably for all backends. Mitigation: each message resource has a ULID, so conflicting INSERTs don't collide on the same triple subject — but the document's modification timestamp can churn. Accept for v0; ESS-style preconditions are an upgrade path.
- **WebSocket subscription expiry.** CSS v7 expires subscriptions after 2 weeks. Client must re-subscribe on a 1-week timer. Implement carefully — a missed re-subscribe means silent message loss. Add a heartbeat ping on the client side and re-subscribe on any disconnect.
- **Container subscriptions are CSS-specific.** Subscribing to a container and getting `Add` notifications on child changes is implemented in CSS but **not mandated by the W3C WebSocketChannel2023 spec**. ESS supports it too; NSS does not. The prototype is CSS-portable but not server-agnostic. Document this prominently.
- **UTC day rollover bugs.** At midnight UTC the client must switch subscriptions to the new day's container, which doesn't exist yet (and CSS may refuse to subscribe to a non-existent resource). Mitigation: subscribe at the parent room-container level for cross-day events, plus a 5-minute window of re-subscription retries after midnight.
- **No federation.** Two demo personas live on different CSS instances in our docker-compose, but the Next.js client is configured to trust both as OIDC issuers — not a real cross-organization federation. A naive user could expect "I can chat with my friend on solidcommunity.net from my own pod on inrupt.net," and we'd say: not yet, that's v1 with UMA. Document clearly.
- **LDN inbox spam.** Public inboxes are append-only and accept LDN from anyone — drive-by spam is real and unsolved at the protocol level ([spec discussion #549](https://github.com/solid/specification/discussions/549)). For v0 the demo personas trust each other. Production deployments would need a per-user invite-allow-list or a captchaed bouncer.
- **No E2EE.** Server admins (CSS operators, the pod host) can read all messages. The architecture allows E2EE retrofit (sealed-box on `sioc:content`), but v0 ships plaintext. Document this in the transparency page so no one is surprised.
- **Edge-case: a member is invited, accepts, then the room owner revokes their ACL.** Their cached message history still works (read from their local IndexedDB / React state) but new messages don't appear and writes fail. Render a clear "You no longer have access to this room" banner when an authenticated GET returns 403.
- **Regulatory.** GDPR-friendly here (minimal central PII, user-controlled pods, no analytics). DSA "online platform" obligations may apply at scale; check before scaling. For an MVP among demo personas this is bounded.

## What gets unlocked after this MVP

In rough order of value:

1. **E2EE.** The architectural killer feature. X25519 pubkey published in WebID profile (custom predicate or repurpose `cert:key`); messages sealed-box-encrypted with libsodium in the browser; ciphertext stored as `sioc:content`. Pod operators can't read messages. Solid-native E2EE is largely uncharted; shipping this is the prototype's biggest possible novel contribution.
2. **Cross-server federation.** UMA tokens for granting foreign WebIDs `acl:Append` on your inbox. Means alice@solidcommunity.net can chat with bob@inrupt.net. The big unlock for "real" multi-org chat.
3. **Public-room directory (the optional indexer).** Discoverable rooms for community / topic chat, not just friend-graph DMs. SQLite-backed, public-only data.
4. **Presence.** `presence.ttl` heartbeat pattern. Not a Solid primitive — has to be a convention.
5. **Search.** Tantivy/SQLite-FTS over your own message history, optionally over public-room history. Per-user index, lives in the user's pod or a side-car indexer.
6. **Voice notes.** Audio blobs in `uploads/`. The long-chat spec doesn't model audio; needs a small vocab extension.
7. **Mobile native apps.** Solid OIDC on mobile is rougher than the web; once the web app is stable, port.
8. **Group video calls.** Out of architectural scope without a STUN/TURN service. Probably a separate prototype.
9. **Mind ecosystem cross-links.** A "chat with the seller" button in `mind-market-v0`. A "talk to your code reviewer" button in `mind-codespaces-v0`. Profile linking across prototypes — your WebID is your identity, not your per-app account.

The MVP is designed so each of these is additive, not a rewrite.

## References

See [`docs/research-notes.md`](./research-notes.md) for the full prior-art survey, protocol details (WebSocketChannel2023 wire format, CSS config, LDN inbox flow), and links to the existing Solid chat ecosystem (SolidOS chat-pane, Liqid Chat, POD-CHAT 2.0, deChat).

# mind-chat-v0 — research notes

Pre-implementation research conducted 2026-05-26. Three parallel agents surveyed (1) the sibling prototypes for conventions to mirror, (2) the existing Solid chat ecosystem and the long-chat data model, and (3) real-time delivery primitives on Solid (WebSocketChannel2023, LDN, federation). Output below is captured verbatim-ish for future implementation reference — when in doubt, this file is the authoritative source for "why we picked X."

## 1. Sibling-prototype conventions (what mind-chat-v0 must mirror)

### Universal scaffolding shape

- `package.json` with `scripts/` (dev, build, start, seed/smoke scripts using `tsx`, typecheck, lint)
- `docker-compose.yml` with CommunitySolidServer instances (CSS v7, persistent named volumes for pod data)
- `AGENTS.md` with prototype-specific constraints (overrides `CLAUDE.md` via `@AGENTS.md`)
- `CLAUDE.md` stub (minimal, references `@AGENTS.md`)
- `README.md` with setup walkthroughs, endpoint tables, demo users, env vars
- `src/app/` — Next.js App Router (pages in subdirs with `page.tsx`)
- `src/lib/` — shared patterns (`solid/`, `schemas/`, `util/`, `types/`)
- `src/components/` — React components
- `.env` — minimal (API keys, seed credentials dev-only)
- `.css-data/`, `.indexer-data/` — gitignored state directories
- `.next/` — Next.js build cache (sometimes stale; `rm -rf .next` required)

### Port assignment

| Prototype | Dev port | CSS port(s) |
|---|---|---|
| `mind-market-v0` | 3000 | 3001, 3002 |
| `mind-codespaces-v0` | 3010 | 3011 |
| `mind-os-v0` | 3020 | 3021 |
| **`mind-chat-v0`** (this) | **3030** | **3031, 3032** |
| `mind-social-network-v0` | 3050 | 3051, 3052 |

`mind-chat-v0` takes the 303x decade, leaving 304x free for the next prototype.

### Standard `src/lib/solid/` contents (port these)

- `session.ts` — `useSession()` hook exposing `(webid, loggedIn, loading, signIn, signOut)`
- `session.server.ts` — server-side token handling
- `pod-client.ts` — `readResource()` / `writeResource()` wrappers around `@inrupt/solid-client`
- `profile.ts` — user profile read/write
- `ldn-client.ts` — Linked Data Notifications (inbox posting)

For mind-chat-v0 specifically, add:

- `chat.ts` — room create, message PATCH, day-file PUT-if-not-exists
- `chat-subscription.ts` — WebSocketChannel2023 subscribe/unsubscribe, day-rollover handling
- `chat-acl.ts` — invite/revoke membership via WAC

### Auth flow (mirror social-network exactly)

1. `useSession()` calls `handleIncomingRedirect({ restorePreviousSession: true })` on first mount
2. Fallback to `getDefaultSession()` if restore fails
3. User clicks "Sign In" → `login({ oidcIssuer, redirectUrl: "/login/callback", clientName })`
4. OIDC redirect → browser returns to `/login/callback`, `handleIncomingRedirect()` captures session
5. WebID extracted from `session.info?.webId`

### The "never invent a central database" rule (from mind-social-network-v0/AGENTS.md)

> This prototype runs on Solid pods. **Never invent a central database for user data, posts, follows, DMs, in-progress duels, or blocks.** The indexer is allowed to cache only PUBLIC data per `docs/PRD.md` §Privacy guarantees.
>
> **Never log:** DM contents, post bodies, block lists, capability tokens, or raw LDN payloads. OK to log: WebID, route, status, latency, error code, high-level event type.

Applied to chat: never invent a central message table, never invent a central membership table, never log message bodies or membership.

### What mind-social-network-v0's DM module looks like (closest reference)

Path: `mind-social-network-v0/src/lib/solid/dm.ts`. Pattern:

- DM threads stored as Solid containers on initiator's pod at `<pod>/dms/{threadId}/`
- Thread metadata in `thread.ttl`; messages in `messages/{id}` RDF resources
- ACL TODO (relies on CSS defaults today; production needs explicit `setPublicAccess(false)` + `setAgentAccess(recipientWebid, full)`)
- Polling-only delivery (read on page load + manual refresh); no notifications

Custom RDF vocab used there:
- `DM_BODY = "http://mind.example/voc#body"`
- `DM_SENDER = "http://mind.example/voc#sender"`
- `DM_PARTICIPANT = "http://mind.example/voc#participant"`

**mind-chat-v0 deliberately diverges:** instead of inventing `mind.example/voc#` predicates, we adopt the SolidOS long-chat spec (`meeting:`, `sioc:`, `foaf:`, `dct:`, `schema:`) for free interop with SolidOS chat-pane and to reduce schema bikeshedding.

## 2. Solid chat ecosystem — prior art survey

### Existing apps

| App | What it does | Vocab | Maintained | License | Repo |
|---|---|---|---|---|---|
| **SolidOS chat-pane** | Reference chat applet, daily `chat.ttl`, threads, edits, reactions | `meeting:LongChat` + `sioc:content` + `foaf:maker` + `dct:created` + `schema:LikeAction` | Active (v3.0.3, commits into 2026) | MIT | [SolidOS/chat-pane](https://github.com/SolidOS/chat-pane) |
| **Liqid Chat** (ochat) | Mobile + web client, friend search, push notifications | Inherits SolidOS long-chat | Last forum activity 2024 | MIT | [ochat-client](https://github.com/o-development/ochat-client) |
| **POD-CHAT Messenger 2.0** | Cross-pod chat with RSA-signed messages, ActivityStreams to inbox | Custom `podchat:` + AS2 | 2023-ish | unspecified | [0l5en/pod-chat-client](https://github.com/0l5en/pod-chat-client) |
| **Inbox** (research) | Angular LDN inbox; AS2 + WebSockets | AS2 (`as:Note`, `as:Create`) | Frozen ~2021 | unclear | [forum thread](https://forum.solidproject.org/t/inbox-new-messaging-application/4093) |
| **ChatSolid** | Experimental WebRTC P2P over Solid auth | n/a (P2P) | Research demo 2023 | varies | [forum thread](https://forum.solidproject.org/t/chatsolid-my-take-on-a-solid-decentralized-chat-application-and-webrtc/7246) |
| **dechat** | Academic Solid chat from Univ. of Oviedo | mixed sioc/schema | Coursework, dormant | varies | [arquisoft/dechat_es4b](https://arquisoft.github.io/dechat_es4b/app/) |

### The long-chat layout (de facto storage standard)

Spec: [solid.github.io/chat](https://solid.github.io/chat/). Client-client spec — no server awareness needed.

```
$ROOT/index.ttl              # <#this> a meeting:LongChat
$ROOT/2026/05/26/chat.ttl    # one container per UTC day
```

Key predicates:

- `meeting:LongChat` — channel class (`http://www.w3.org/ns/pim/meeting#`)
- `meeting:message` — links channel to a message resource
- `sioc:content` — message body text
- `foaf:maker` — author WebID
- `dct:created` — UTC timestamp
- `dct:isReplacedBy` — edit chain
- `schema:dateDeleted` — soft delete
- `sioc:has_reply` / `sioc:Thread` — threading
- `schema:LikeAction` / `schema:AgreeAction` — reactions

Messages are **appended via HTTP PATCH (SPARQL UPDATE INSERT)** to today's `chat.ttl`. Messages deliberately have **no `rdf:type`** to save bytes.

**ActivityStreams 2.0 (`as:Note`/`as:Create`) is used only for LDN inbox notifications between pods, not for message storage.** `schema:Message` is essentially unused.

**Decision: mind-chat-v0 adopts the SolidOS long-chat layout verbatim** so existing tooling (SolidOS chat-pane) can read our data.

### Solid Notifications Protocol — concrete status

[Spec](https://solidproject.org/TR/notifications-protocol) is a framework, not a list of channel types. Three channel types registered today:

- **[WebSocketChannel2023](https://solid.github.io/notifications/websocket-channel-2023)** — POST a JSON-LD subscription with `type` + `topic`, get back `receiveFrom` WebSocket URL.
- **[WebhookChannel2023](https://solid.github.io/notifications/webhook-channel-2023)** — server pushes to your HTTPS endpoint (needs public address).
- **StreamingHTTPChannel2023** — server-pre-established HTTP stream, read-only.

#### WebSocketChannel2023 subscription flow (three hops, all RDF/HTTP)

1. **Discover** the storage description: `HEAD` any pod resource, follow the `Link` header with `rel="http://www.w3.org/ns/solid/terms#storageDescription"` (typically `/.well-known/solid`).
2. **POST** to the subscription endpoint listed there:
   ```json
   { "@context": ["https://www.w3.org/ns/solid/notification/v1"],
     "type": "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
     "topic": "https://alice.pod/chats/room-42/" }
   ```
3. **Read** the `receiveFrom` field in the response (e.g. `wss://alice.pod/.notifications/WebSocketChannel2023/?auth=...`) and open a `WebSocket` to it.

Subscription POST requires Solid-OIDC auth with `Read` on the topic; the spec uses DPoP-bound tokens in its example but says only "follows the Solid Protocol guidance."

#### CSS v7 support

- **WebSocket notifications enabled by default.** CSS docs note that "Most default configurations have been updated to use `http/notifications/websockets.json`". Component id: `urn:solid-server:default:WebSocket2023Subscriber` with a tunable `maxDuration` (minutes).
- **Container subscriptions WORK in CSS** (critical for chat): subscribing to a container emits `Add` and `Remove` notifications with `target` = container, `object` = affected child. **The W3C spec itself does not mandate this**, but CSS implements it — so this prototype is CSS-portable but not server-agnostic.
- WebhookChannel2023 and StreamingHTTPChannel2023 also supported.
- Subscriptions auto-expire after 2 weeks (configurable). Only `Read` perm checked.
- Notifications carry the AS2 `Update`/`Create`/`Delete` activity but **not the resource body** — clients must re-GET the changed resource.

#### Inrupt SDK status

`@inrupt/solid-client-notifications` v4.0.0 shipped 2025-11-03 (Node 20+). The `WebsocketNotification` class wraps the three-hop dance; pass an authenticated `fetch`, call `.connect()`, listen for `message` / `error` events.

- npm: https://www.npmjs.com/package/@inrupt/solid-client-notifications
- CHANGELOG: https://github.com/inrupt/solid-client-notifications-js/blob/main/CHANGELOG.md
- Docs (current URL): https://docs.inrupt.com/sdk/javascript-sdk/notifications.md (the old `/tutorial/subscribe-to-notifications/` URL 404s)

### Server support matrix

| Server | WS notifications | Notes |
|---|---|---|
| **CSS v7** | Yes (WS2023 + Webhook2023 + Streaming2023) | Subscriptions auto-expire after 2 weeks. Container `Add`/`Remove` events implemented. |
| **NSS (node-solid-server)** | Legacy `solid-0.1` WS protocol only (`live: true`) | Deprecated. |
| **Inrupt ESS** | Yes (commercial), WS2023 + Webhook2023 | Separate WebSocket Notification Service. |

### LDN inbox pattern (for out-of-band signals)

- **WebID exposes** `ldp:inbox` pointing at an LDP container (any container; `ldp:Container` is sufficient per LDN spec).
- **Alice POSTs** an Activity Streams 2.0 JSON-LD notification to Bob's inbox URL; LDN says the inbox MUST mint a new resource on POST.
- **CSS does NOT auto-create an inbox.** You provision `/inbox/` and patch the WebID to add `ldp:inbox` during account setup.
- The social-network prototype already does the receiving half: see `mind-social-network-v0/src/app/api/ldn/inbox/route.ts` + `src/lib/schemas/ldn-payloads.ts` (11 typed LDN payloads, Zod-validated, dedup'd by `id`). **Port this directly** for mind-chat-v0's invite-handling.

### E2E encryption — prior art is thin

- Inrupt's [Solid E2E blog](https://www.inrupt.com/blog/solid-e2e) is a position piece, not shipped tech.
- POD-CHAT does **signing only** (`podchat:signature`, RSA pubkey in WebID profile) — server still reads messages.
- Nothing in `@inrupt/solid-client` ships crypto. No de facto Signal/MLS-on-Solid library.
- KIT Karlsruhe published academic work ([Web Push from Solid Pods](https://publikationen.bibliothek.kit.edu/1000149760/156149736)) but no production code.

**The reasonable shippable pattern (deferred to v1):** publish X25519 pubkey in WebID profile (custom predicate or reuse `cert:key`); libsodium sealed-boxes in browser; ciphertext as `sioc:content`. mind-chat-v0 would be among the first to ship this properly.

### Access control patterns observed

Existing apps split into two camps:

- **Shared-channel** (SolidOS, Liqid): both participants get WAC `acl:Read`+`acl:Write` on a shared container hosted on **one** participant's pod. Cheap; participants must trust each other's pod.
- **Sender-hosted + LDN inbox** (POD-CHAT, Inbox): sender writes to **their own** pod, grants reader WAC `acl:Read` on that resource, then POSTs an AS2 `as:Create { object: <msg-url> }` to the recipient's `ldp:inbox`. Recipient polls or subscribes to `/inbox/`.

**WAC vs ACP:** WAC is universally supported (CSS v7 default), ACP is ESS-only. For chat, WAC `acl:agent` listing each member WebID is sufficient — keep WAC.

**Decision: mind-chat-v0 uses the shared-channel pattern** (room hosted on owner's pod, members get WAC append). It's the simpler model and fits the "rooms have an owner" UX. The sender-hosted pattern is more elegant but requires every member's pod to be writeable by every other member, which is a federation tax we're deferring.

### Latency expectations

- **WebSocketChannel2023 round-trip:** write→push is ~50–200 ms on same-server pods (dominated by ACL eval + serialization). Comparable to a normal websocket app.
- **Inbox-poke + fetch:** two HTTP round-trips (LDN POST, then GET on sender's pod), ~200–500 ms cross-server.
- **Polling:** every existing Solid chat (Solid Chat, deChat) historically polled the chat file. 2 s polling is standard prior-art and entirely acceptable for v0.

### Federation reality check

Cross-pod is possible but painful:

- Bob's pod must grant Alice's WebID `acl:Append` on `/inbox/` (CSS supports this via WAC or ACP).
- Alice's client needs a Solid-OIDC access token whose `aud` covers Bob's resource server. With Inrupt ESS this is plain Solid-OIDC bearer + DPoP; CSS-to-CSS in 2026 also works with Solid-OIDC, but **UMA** is the emerging story for unrelated pods (ESS uses it). Client Credentials only helps for app-to-own-pod.
- **Locally testable:** two CSS instances on `localhost:3031` and `localhost:3032` can talk via Solid-OIDC if the issuer is reachable and CORS is open. The friction is the WebID's `oidcIssuer` claim — both servers must trust the issuer's JWKS. Fine for local dev when both are CSS.

**Decision: v0 ships two CSS instances on the dev box, both trusted by the Next.js client's OIDC config.** Real foreign-pod federation deferred.

### What's currently broken or hard

- **No presence.** No online/offline primitive in Solid. Hack: write a `presence.ttl` with `dct:modified` heartbeats; subscribers infer online from recency.
- **Notification latency.** WS2023 is event-driven but the notification is metadata-only — every event triggers a follow-up authenticated GET. Cold-start round trip on CSS is ~100-300 ms over LAN.
- **No federation primitive for typing/read-receipts.** Each ephemeral signal would need a pod write; existing apps just don't ship these.
- **Subscription expiry pain.** CSS auto-expires WS subscriptions; clients must reconnect/resubscribe. Several open issues in [solid/notifications](https://github.com/solid/notifications).
- **LDN inbox spam.** Pods advertise public `ldp:inbox` with append-only access — drive-by spam is real and not solved.
- **PATCH-append contention.** Two clients PATCHing the same `chat.ttl` simultaneously can race; CSS does not expose conditional-write ETags reliably for all stores.
- **Mobile background notifications.** No standard for waking a mobile client when its pod gets a message — WebPush-on-Solid is research-only.
- **AS2 vs long-chat split.** Storage = `sioc:content`, inter-pod notification = AS2. Two vocabs for one app. Annoying but standard.

## 3. Pragmatic v0 plan (synthesizes the above)

Ship v0 as **"same-CSS-instance-pair (alice + bob), container-scoped WebSocketChannel2023 via @inrupt/solid-client-notifications v4, append-only message resources on the long-chat layout, 2-second polling fallback."**

It's ~50 lines of subscribe code, faithful Solid, and the cross-pod LDN path is a clean upgrade later. The social-network prototype's inbox handler is the receiving template.

## Cite-able references

### Specs
- Solid Notifications Protocol — https://solid.github.io/notifications/protocol
- WebSocketChannel2023 — https://solid.github.io/notifications/websocket-channel-2023
- WebhookChannel2023 — https://solid.github.io/notifications/webhook-channel-2023
- Solid Chat (long-chat client-client spec) — https://solid.github.io/chat/
- LDN W3C Rec — https://csarven.ca/linked-data-notifications  /  https://www.w3.org/TR/ldn/
- Web Access Control spec — https://github.com/solid/web-access-control-spec
- WAC vs ACP diff — https://github.com/solid/authorization-panel/blob/main/proposals/wac-acp-diff-story.md

### Implementations
- Community Solid Server v7 notifications docs — https://communitysolidserver.github.io/CommunitySolidServer/7.x/usage/notifications/
- `@inrupt/solid-client-notifications` v4.0.0 (2025-11-03) — https://www.npmjs.com/package/@inrupt/solid-client-notifications
- Inrupt notifications docs — https://docs.inrupt.com/sdk/javascript-sdk/notifications.md
- SolidOS chat-pane — https://github.com/SolidOS/chat-pane
- SolidOS Chat docs — https://solidos.solidcommunity.net/Team/docs/hotTopics/Chat.html
- Liqid Chat — https://github.com/o-development/ochat-client
- POD-CHAT 2.0 — https://github.com/0l5en/pod-chat-client
- Inbox messaging app — https://forum.solidproject.org/t/inbox-new-messaging-application/4093

### Open issues & known unsolved
- Inbox spam — https://github.com/solid/specification/discussions/549
- solid-notifications-aggregator (mitigation prior art) — https://github.com/SolidLabResearch/solid-notifications-aggregator
- Real-Time Solid SoSy24 demo — https://cxres.inrupt.net/public/SoSy24/RealTimeSolid/index.html
- TPAC 2024 Solid notifications demo — https://www.w3.org/2024/09/TPAC/demo-solid-3.html
- Web Push Notifications from Solid Pods (KIT 2022) — https://publikationen.bibliothek.kit.edu/1000149760/156149736

### In-repo references
- `mind-social-network-v0/src/lib/solid/dm.ts` — closest analog to chat (port patterns, diverge on schema)
- `mind-social-network-v0/src/app/api/ldn/inbox/route.ts` — LDN inbox handler (port directly for chat invites)
- `mind-social-network-v0/src/lib/schemas/ldn-payloads.ts` — Zod-validated LDN payload schemas (extend for chat-invite + chat-mention payloads)
- `mind-social-network-v0/src/lib/solid/session.ts` — auth flow (port verbatim)
- `mind-social-network-v0/docker-compose.yml` — two-CSS-instance pattern (port, change ports to 3031/3032)

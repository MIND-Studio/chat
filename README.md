# mind-chat-v0

Privacy-first chat prototype. Rooms, messages — all stored as RDF in Solid pods using the [SolidOS long-chat layout](https://solid.github.io/chat/). No central message store. Real-time delivery via Solid notifications (WebSocketChannel2023), not a chat server.

See [`docs/PRD.md`](./docs/PRD.md) for the full spec and [`docs/research-notes.md`](./docs/research-notes.md) for the prior-art survey and protocol research that shaped the design.

## What this prototype proves

1. **Real chat — rooms, messages — can run on Solid pods with the [SolidOS long-chat spec](https://solid.github.io/chat/) as the on-pod data model.** No bespoke message schema, free interop with SolidOS chat-pane. (Edits, deletes, reactions, threading are deferred to v1; the data model supports them.)
2. **Real-time delivery on Solid is shippable today.** WebSocketChannel2023 in Community Solid Server v7 gives **sub-100 ms** write-to-render latency in the verified end-to-end test. Polling is the fallback path.
3. **The platform stays tiny.** No backend tables, no central message store. All identity, membership, messages, and access control live on user pods.

## Dev setup

Two services: the Next.js app (port 3030) and a single CommunitySolidServer instance (port 3031) hosting both demo personas (alice + bob). Both personas share the same OIDC issuer; cross-server federation is deferred to v1.

### Start the stack

```bash
docker compose up -d        # bring up the CSS pod host
export NODE_AUTH_TOKEN=$(gh auth token)   # @mind-studio/* come from GitHub Packages
npm install                 # one-time
npm run dev                 # start Next.js on http://localhost:3030
```

> **Shared packages (GitHub Packages).** The UI rides `@mind-studio/ui` (design
> system + `ThemeProvider`) and `@mind-studio/core` (the `MindLoginCard`), both
> published to **GitHub Packages**. A committed `.npmrc` scopes `@mind-studio`
> to that registry; before installing, export a token with `read:packages`
> (`export NODE_AUTH_TOKEN=$(gh auth token)`, or a PAT). The app ships two
> brands via the appearance toggle: **Mind** (default) and **Deep Space** (the
> original glassy/cyan look, preserved as `src/lib/theme/deepspace.ts`).

URLs:

- App: <http://localhost:3030/>
- CSS pod host: <http://localhost:3031/>
- Alice's pod: <http://localhost:3031/alice/>
- Bob's pod: <http://localhost:3031/bob/>

### Seed the demo room

```bash
npm run seed:demo
```

Provisions `chat/general/` on alice's pod, writes the WAC ACL granting bob read+append, and posts a couple of opening messages so the UI has content on first load. Idempotent — safe to re-run.

### Verify it works

```bash
npm run smoke:pods          # CSS instance + both pods reachable
npm run smoke:roundtrip     # Protocol-level: alice posts → bob's Node WebSocket receives the notification
npm run smoke:ui            # Browser-level: two headless contexts (alice + bob), end-to-end UI test
```

`smoke:ui` opens two isolated Chromium contexts, signs each in via the CSS interactive OIDC flow, has alice type a probe message, and asserts bob's UI receives it. Verified locally at **9 ms** browser-to-browser propagation.

### Resetting dev state

`docker compose down` stops the CSS service but keeps the `css-data` named volume. Run `docker compose down -v` only when you want a clean slate — that wipes all pod data and you'll need to re-run `npm run seed:demo`.

> **Port note:** This prototype uses **3030/3031** to coexist with the sibling stacks (market on 300x, codespaces on 301x, os on 302x, social-network on 305x). Each prototype gets its own decade so any two can run side-by-side.

## What's on the pod

After `seed:demo`, alice's pod contains:

```
http://localhost:3031/alice/
├── profile/card               # WebID profile (seeded by CSS)
└── chat/
    └── general/
        ├── index.ttl          # <#this> a meeting:LongChat
        ├── .acl               # WAC: alice = Control, bob = Read+Append
        └── 2026/05/26/        # today's UTC date
            └── chat.ttl       # one ttl per UTC day, append-only
                               #  contains: <chat.ttl#this> meeting:message <#msg-...>
                               #            <#msg-...> sioc:content "Hello world" ;
                               #                       foaf:maker <alice-webid> ;
                               #                       dct:created "..."^^xsd:dateTime
```

When alice's client (or the seed script) PATCHes today's `chat.ttl`, CSS emits a `Notification.Update` over WebSocketChannel2023. Bob's subscribed client GETs the new resource and renders the message.

## Sibling prototypes

This prototype is part of the Mind ecosystem and shares its stack (Next.js 16 + Inrupt + Tailwind v4 + Docker) with:

- [`mind-market-v0`](../mind-market-v0/) — privacy-first marketplace
- [`mind-codespaces-v0`](../mind-codespaces-v0/) — privacy-first dev environments
- [`mind-os-v0`](../mind-os-v0/) — Debian-in-the-browser with the pod as disk
- [`mind-social-network-v0`](../mind-social-network-v0/) — privacy-first social network (closest reference; its `src/lib/solid/dm.ts` is the most analogous module)

A single WebID can move between all of them.

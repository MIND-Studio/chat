# chat

Privacy-first chat prototype. Rooms, messages — all stored as RDF in Solid pods using the [SolidOS long-chat layout](https://solid.github.io/chat/). No central message store. Real-time delivery via Solid notifications (WebSocketChannel2023), not a chat server.

See [`docs/PRD.md`](./docs/PRD.md) for the full spec and [`docs/research-notes.md`](./docs/research-notes.md) for the prior-art survey and protocol research that shaped the design.

## What this prototype proves

1. **Real chat — rooms, messages — can run on Solid pods with the [SolidOS long-chat spec](https://solid.github.io/chat/) as the on-pod data model.** No bespoke message schema, free interop with SolidOS chat-pane. (Edits, deletes, reactions, threading are deferred to v1; the data model supports them.)
2. **Real-time delivery on Solid is shippable today.** WebSocketChannel2023 in Community Solid Server v7 gives **sub-100 ms** write-to-render latency in the verified end-to-end test. Polling is the fallback path.
3. **The platform stays tiny.** No backend tables, no central message store. All identity, membership, messages, and access control live on user pods.

## Dev setup

Two services: the Next.js app (port 3030) and the **shared Mind CommunitySolidServer** on `:3011` (run once at the workspace root — see [`../../SOLID-SERVER.md`](../../SOLID-SERVER.md)) hosting both demo personas (alice + bob). Both personas share the same OIDC issuer; cross-server federation (a 2nd CSS for bob) is deferred to v1.

### Start the stack

```bash
(cd ../.. && docker compose up -d)        # shared Mind CSS on :3011 (once for all apps)
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
- CSS pod host (shared): <http://localhost:3011/>
- Alice's pod: <http://localhost:3011/alice/>
- Bob's pod: <http://localhost:3011/bob/>

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

From the workspace root, `docker compose down` stops the shared CSS but keeps `./.css-data`. Run `docker compose down -v` only when you want a clean slate — that wipes all pod data and you'll need to re-run `npm run seed:demo`.

> **Port note:** The app uses **3030**; the pod host is the shared Mind CSS on **3011** (no longer a per-app `:3031`). App ports get their own decade per prototype so any two can run side-by-side.

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

- [codespaces](https://github.com/MIND-Studio/codespaces) — privacy-first dev environments

A single WebID can move between all of them.

## Releases

Versioning, `CHANGELOG.md`, and tags are automated with
[release-please](https://github.com/googleapis/release-please) — **don't tag or
edit `CHANGELOG.md` by hand.**

1. Commit to `main` using [Conventional Commits](https://www.conventionalcommits.org):
   `fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE:` → major.
   `chore:` / `docs:` / `refactor:` / `test:` don't trigger a release.
2. release-please keeps an open **"chore(main): release X.Y.Z"** PR that rolls the
   pending commits into `CHANGELOG.md` and bumps the version.
3. Merge that PR to release: it creates the `vX.Y.Z` tag + GitHub Release, which
   fires `release.yml` to build and push the Docker image to GHCR.
4. Deploying the image to production is a separate, manual GitOps step in
   [`mindpods-infra`](https://github.com/MIND-Studio/mindpods-infra) (`mind-deploy.sh`).

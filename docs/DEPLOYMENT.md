# Deploying mind-chat to `chat.mindpods.org`

Plan to take `mind-chat-v0` from a dev-only prototype to a shipped app in the
[`mindpods-infra`](../../mindpods-infra) fleet, alongside dock / drive / builder /
codespaces. It mirrors exactly what those four already do — copy from
`mind-drive-v0` (Dockerfile + `release.yml`) and follow
[`mindpods-infra/docs/APP-DOCKERFILE.md`](../../mindpods-infra/docs/APP-DOCKERFILE.md).

Status (2026-06-02): **not shippable yet.** No Dockerfile, no `output: "standalone"`,
no CI, not wired into infra. This doc is the to-do list.

---

## Architecture note (why this is simpler than it looks)

mind-chat is a **client-only SPA**: no API routes, no server-only code, all
components are `'use client'`. It talks directly to the pod for OIDC, data, and
real-time. **`WebSocketChannel2023` connects to `pod.mindpods.org`** — which Caddy
already reverse-proxies — **not** to the chat app's own origin.

Consequence: the `chat.mindpods.org` vhost is a plain reverse-proxy to a standalone
Next server on `:3000`. **No WebSocket pass-through is needed on the chat vhost.**
(The pod vhost already carries the WS traffic.)

---

## Blockers to resolve before shipping (design)

These are real decisions, not mechanics — settle them first.

1. **`NEXT_PUBLIC_ROOM_URL` is a single hard-coded room baked at build time.**
   Today the app points at one room (`…/testuser/chat/general`). A shipped product
   needs per-user rooms discovered at runtime (e.g. read the signed-in WebID's pod,
   list/create rooms under `…/<me>/chat/`). Until that exists, the prod image only
   ever shows one fixed room. **Decide:** ship a fixed demo room for the alpha, or
   build room discovery first. (The rest of this plan assumes a fixed demo room for
   v0.1.0 and treats discovery as a fast-follow.)

2. **Env-name drift.** The code reads *both* `NEXT_PUBLIC_OIDC_ISSUER` and
   `NEXT_PUBLIC_SOLID_ISSUER`. Per `APP-DOCKERFILE.md §2`, standardize on
   `NEXT_PUBLIC_SOLID_ISSUER` and delete the alias *before* the first build —
   `NEXT_PUBLIC_*` is build-time-inlined, so the drift becomes permanent per image.

3. **Demo personas / passwords.** `.env.live.example` carries a `chat-bob` account
   with a dev password and assumes the room owner granted it ACL read+append. For a
   real deploy, don't bake demo creds into the image (they're server-side script
   vars, not `NEXT_PUBLIC_*`, so they won't be — but make sure the prod build args
   are clean). Provision any demo personas via a seed run against the live pod, not
   the image.

---

## Part A — Productionize the app repo (`mind-chat-v0`)

Four changes, all in this repo. None touch infra.

### A1. Standalone output

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",                                  // emits .next/standalone/server.js
  transpilePackages: ["@mind-studio/core", "@mind-studio/ui"],
};

export default nextConfig;
```

### A2. Canonical env names

- Replace all `NEXT_PUBLIC_OIDC_ISSUER` reads with `NEXT_PUBLIC_SOLID_ISSUER`.
- Update `.env.example` / `.env.live.example` to match.

### A3. Prod Dockerfile

Copy `mind-drive-v0/Dockerfile` verbatim and swap the build-args block for chat's.
Two-stage `node:22-bookworm-slim`, `.npmrc` + `NODE_AUTH_TOKEN` BuildKit secret for
`@mind-studio/*` from GitHub Packages, standalone runtime as `node` user on `:3000`.
The chat-specific `ARG`/`ENV` block:

```dockerfile
ARG NEXT_PUBLIC_SOLID_ISSUER
ARG NEXT_PUBLIC_POD_BASE_URL
ARG NEXT_PUBLIC_ROOM_URL
ARG NEXT_PUBLIC_PERSONA_A_NAME
ARG NEXT_PUBLIC_PERSONA_B_NAME
ENV NEXT_PUBLIC_SOLID_ISSUER=$NEXT_PUBLIC_SOLID_ISSUER \
    NEXT_PUBLIC_POD_BASE_URL=$NEXT_PUBLIC_POD_BASE_URL \
    NEXT_PUBLIC_ROOM_URL=$NEXT_PUBLIC_ROOM_URL \
    NEXT_PUBLIC_PERSONA_A_NAME=$NEXT_PUBLIC_PERSONA_A_NAME \
    NEXT_PUBLIC_PERSONA_B_NAME=$NEXT_PUBLIC_PERSONA_B_NAME

# Shared app-launcher links (every Mind app must bake all four):
ARG NEXT_PUBLIC_APP_DOCK_URL
ARG NEXT_PUBLIC_APP_DRIVE_URL
ARG NEXT_PUBLIC_APP_BUILDER_URL
ARG NEXT_PUBLIC_APP_CODESPACES_URL
ENV NEXT_PUBLIC_APP_DOCK_URL=$NEXT_PUBLIC_APP_DOCK_URL \
    NEXT_PUBLIC_APP_DRIVE_URL=$NEXT_PUBLIC_APP_DRIVE_URL \
    NEXT_PUBLIC_APP_BUILDER_URL=$NEXT_PUBLIC_APP_BUILDER_URL \
    NEXT_PUBLIC_APP_CODESPACES_URL=$NEXT_PUBLIC_APP_CODESPACES_URL
```

> When chat joins the suite, also add a `NEXT_PUBLIC_APP_CHAT_URL` entry to the
> `@mind-studio/core` launcher catalog and pass it as a build-arg to **every** app
> (a `core` bump + re-release of the siblings), so chat shows up in their launchers.

### A4. Release CI

Copy `mind-drive-v0/.github/workflows/release.yml` to
`.github/workflows/release.yml`. Change:

- `IMAGE_NAME: mind-chat`
- the `build-args:` block to the chat set:

```yaml
build-args: |
  NEXT_PUBLIC_SOLID_ISSUER=https://pod.mindpods.org/
  NEXT_PUBLIC_POD_BASE_URL=https://pod.mindpods.org/
  NEXT_PUBLIC_ROOM_URL=https://pod.mindpods.org/testuser/chat/general
  NEXT_PUBLIC_PERSONA_A_NAME=Test User
  NEXT_PUBLIC_PERSONA_B_NAME=Chat Bob
  NEXT_PUBLIC_APP_DOCK_URL=https://dock.mindpods.org
  NEXT_PUBLIC_APP_DRIVE_URL=https://drive.mindpods.org
  NEXT_PUBLIC_APP_BUILDER_URL=https://builder.mindpods.org
  NEXT_PUBLIC_APP_CODESPACES_URL=https://codespaces.mindpods.org
```

- the summary block to emit `MIND_CHAT_IMAGE=…@sha256:…`.

Repo settings: **Actions → Workflow permissions → read+write** (so `GITHUB_TOKEN`
can push the GHCR package and install `@mind-studio/*`).

### A5. Build + verify locally before tagging

```bash
cd mind-chat-v0
npm run typecheck
NODE_AUTH_TOKEN=$(gh auth token) npm run build      # confirm .next/standalone/server.js exists
```

Then cut the release:

```bash
git tag v0.1.0 && git push --tags                   # or: gh workflow run release.yml
```

Copy the printed `MIND_CHAT_IMAGE=ghcr.io/mind-studio/mind-chat@sha256:…` digest.

---

## Part B — Wire into the fleet (`mindpods-infra`)

Five edits in the infra repo. Commit the first four; the fifth is box-only.

### B1. `.env.example` + `.env` — new domain

```
MIND_DOMAIN_CHAT=chat.mindpods.org
```

### B2. `compose.yml` — new service

Add alongside dock/drive/builder (identical shape — standalone Next on :3000):

```yaml
  chat:
    image: ${MIND_CHAT_IMAGE:?set MIND_CHAT_IMAGE in images.env}
    container_name: mind-chat
    restart: unless-stopped
    environment:
      NODE_ENV: production
      HOSTNAME: "0.0.0.0"
      PORT: "3000"
    expose: ["3000"]
    networks: [mind]
```

And add `chat` to caddy's `depends_on: [...]` list.
Also add the env passthrough under the `caddy:` service:
`MIND_DOMAIN_CHAT: ${MIND_DOMAIN_CHAT}`.

### B3. `caddy/Caddyfile` — new vhost

Plain reverse-proxy (no WS block — WS goes to the pod vhost):

```caddy
{$MIND_DOMAIN_CHAT} {
	encode zstd gzip
	reverse_proxy chat:3000
}
```

### B4. `images.env.example` — digest pin placeholder

```
MIND_CHAT_IMAGE=ghcr.io/mind-studio/mind-chat@sha256:REPLACE_ME
```

### B5. Box `images.env` (NOT rsynced by `deploy.sh`)

Paste the real digest from A5 into `/opt/mindpods-infra/images.env`:

```
MIND_CHAT_IMAGE=ghcr.io/mind-studio/mind-chat@sha256:<digest>
```

---

## Part C — DNS

Add an A record (and AAAA if the box has stable IPv6):

| Type | Name | Value |
|---|---|---|
| A | `chat` | 37.27.80.161 |

Wait for propagation **before** deploy — Caddy issues the LE cert on first request
per host, and a failed challenge counts against the rate limit.

---

## Part D — Deploy

From an infra checkout (after C has propagated and B5 is on the box):

```bash
cd mindpods-infra
./scripts/deploy.sh        # rsyncs compose+Caddyfile, GHCR-auths, pulls, up -d
```

> **Caddyfile gotcha:** a Caddyfile change is NOT picked up by `up -d` alone (it's a
> single-file bind mount pinned to the start-time inode). Force-recreate caddy:
> ```bash
> ssh mind-codespaces 'cd /opt/mindpods-infra && \
>   docker compose --env-file .env --env-file images.env up -d --force-recreate --no-deps caddy'
> ```

---

## Part E — Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://chat.mindpods.org     # 200
```

Then the real tests:

1. **SSO:** sign in at `dock.mindpods.org`, open `chat.mindpods.org` — one consent,
   no second password (shared OIDC issuer at `pod.mindpods.org`).
2. **Round-trip:** open the room in two browsers (or use `npm run smoke:roundtrip`
   pointed at the live profile), send a message, confirm sub-100ms delivery via
   `WebSocketChannel2023`.
3. **ACL:** confirm the room owner granted the second persona read+append on
   `…/chat/general` (otherwise the second user sees an empty/forbidden room).

---

## Part F — Seed the live demo room (one-time)

The fixed demo room must exist on the live pod with correct ACL before E2 works:

```bash
cd mind-chat-v0
cp .env.live.example .env.local        # fill PERSONA_*_PASSWORD
npm run seed:demo                       # idempotent; creates room + grants ACL
```

(Provision the `chat-bob` account on `pod.mindpods.org` first if it doesn't exist —
via `codespaces.mindpods.org/signup` or the seed script, depending on its mode.)

---

## Day-2

- **Update chat:** push a new tag in `mind-chat-v0` → copy the new digest into the
  box's `images.env` → `./scripts/deploy.sh`.
- **Room discovery (fast-follow):** replace the baked `NEXT_PUBLIC_ROOM_URL` with
  runtime per-user room listing so the image is user-agnostic. Until then every
  release is pinned to one room.

---

## Checklist

- [x] **Design:** decide fixed-room vs. room-discovery for v0.1.0 — fixed demo room
- [x] A1 `output: "standalone"`
- [x] A2 collapse `NEXT_PUBLIC_OIDC_ISSUER` → `NEXT_PUBLIC_SOLID_ISSUER`
- [x] A3 prod Dockerfile (from mind-drive) — `+ .dockerignore`
- [x] A4 `release.yml` (IMAGE_NAME=mind-chat, chat build-args)
- [ ] A4 enable read+write Actions permissions on the repo
- [~] A5 local build green ✅ → still need: `git init` + GitHub remote → tag `v0.1.0` → grab digest
- [ ] B1 `MIND_DOMAIN_CHAT` in `.env(.example)`
- [ ] B2 `chat` service + caddy `depends_on` + env passthrough
- [ ] B3 Caddy vhost
- [ ] B4 `images.env.example` placeholder
- [ ] B5 real digest in box `images.env`
- [ ] `NEXT_PUBLIC_APP_CHAT_URL` added to `@mind-studio/core` launcher + sibling rebuilds
- [ ] C DNS A record for `chat` (propagated)
- [ ] D `deploy.sh` (force-recreate caddy)
- [ ] E verify 200 / SSO / round-trip / ACL
- [ ] F seed the live demo room

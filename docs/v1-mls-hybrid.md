# mind-chat v1 — Encrypted Transport (WebID identity + MLS + pod archive)

_Forward-looking design. v0 proved real-time chat runs on Solid (long-chat RDF + WebSocketChannel2023, no central store). v1's single bet: make it **actually confidential** — the pod host can no longer read messages — without giving up pod data-ownership or one-WebID SSO._

## Why MLS, and why now

The 2026 decentralized-messaging field has converged on **MLS (RFC 9420)** as the group-E2EE standard (Matrix, ActivityPub/Social Web Foundation, AT Protocol, Wire, RCS, Discord). The winning pattern everywhere is **decentralized identity + MLS transport**, with a shipping proof: [Germ](https://www.germnetwork.com/blog/germ-dm-for-at-protocol-is-live) launched native E2EE DMs on Bluesky (DID identity + MLS) in Feb 2026.

We apply the same pattern with Solid pieces. Crucially, MLS separates two services we can map onto Solid primitives we already have:

| MLS concept | We implement it as | Notes |
|---|---|---|
| **Authentication Service** (binds identity → signature key) | **WebID profile documents** | Member's MLS `BasicCredential` carries their WebID; the matching signature pubkey is published in `/profile/card`. Verify by dereferencing the WebID. User-owned, portable — a clean fit. |
| **KeyPackage directory** (lets you add offline users) | **each user's pod** (`/mls/keypackages/`, public, append-only) | To add Bob, fetch a one-time KeyPackage from Bob's pod. The pod *is* the prekey server. |
| **Delivery Service** (orders + fans out messages) | **the room's pod container** + **WebSocketChannel2023** | Append-only MLS messages on the owner's pod; real-time via the v0 subscription. No central relay. |
| **Archive / ownership** | **the same container** (ciphertext at rest) | long-chat layout, but `sioc:content` holds base64 `MLSMessage` ciphertext instead of plaintext. |

This reuses v0's transport and storage almost verbatim — the change is *what* travels through it (ciphertext) and *who can read it* (only group members, never the pod host).

## What v1 proves

1. **Confidential chat on Solid** — messages are MLS-encrypted in the browser; the CSS/ESS operator stores only ciphertext. This is the differentiator v0's PRD named but deferred.
2. **WebID is a workable MLS Authentication Service** — identity↔key binding via the profile doc, no PKI, no homeserver.
3. **The pod can be a prekey directory + ciphertext archive** — no new central component; data ownership and portability preserved.

## Stack delta from v0

- **MLS:** [OpenMLS](https://openmls.tech/) compiled to WASM, run client-side. (Apache/MIT — avoid `libsignal`, which is AGPL-3.0.)
- **Keep:** WebID-OIDC auth, `@inrupt/solid-client`, WebSocketChannel2023 subscription, CSS v7, long-chat container layout, WAC membership.
- **New pod surfaces:** `/mls/keypackages/` (public prekeys), per-room MLS state, optional per-member decrypted mirror.

## Data model (room owner's pod)

```
/mls/keypackages/                  # public, append-only; one resource per fresh KeyPackage
/chat/<room>/
  index.ttl                        # <#this> a meeting:LongChat ; mls:groupId "..."   (unchanged shape)
  .acl                             # WAC: owner Control, members Read+Append (unchanged)
  YYYY/MM/DD/chat.ttl              # one MLSMessage per resource:
                                   #   <#m-<ulid>> sioc:content "<base64 MLSMessage>" ;
                                   #              mls:epoch N ; dct:created "..." ; foaf:maker <webid>
  handshake/                       # Commits/Proposals (also MLSMessages); separated so app
                                   #   messages and group-state changes are easy to filter
```

**Welcome messages** (adding a member) are delivered to the new member's pod `/inbox/` via LDN (the v0 invite path), carrying the base64 `Welcome` so the joiner can initialize group state. The ACL grant happens in the same step, exactly as v0.

**Reactions / edits / deletes** stay long-chat-shaped but their payloads are encrypted too — they become MLS application messages with a small typed inner content, not plaintext `schema:LikeAction`. (Provenance moves inside the ciphertext, which incidentally fixes v0's "reactor's `foaf:maker` lands on owner's pod" leak.)

## Core flows

- **Publish identity (first run):** generate MLS signature keypair in-browser; publish pubkey to `/profile/card` (`mls:signatureKey`); push a batch of KeyPackages to `/mls/keypackages/`. Replenish when low.
- **Create room:** create the MLS group locally; write `index.ttl` + ACL as v0; you're the only member at epoch 0.
- **Add member:** fetch a KeyPackage from the invitee's pod → produce a `Commit` + `Welcome` → append the Commit to `handshake/`, LDN the `Welcome` to their inbox, grant ACL.
- **Send:** encrypt to current group state → append one `MLSMessage` resource to today's container. v0's subscription fans it out; each member decrypts in-browser.
- **Receive:** on `Add`/`Update`, GET the resource, feed the `MLSMessage` to the local OpenMLS group, render plaintext. Handshake messages advance the epoch before app messages of that epoch decrypt.
- **History:** MLS forward secrecy means old epochs can't be decrypted from current keys. So practical scrollback = **each member persists their own decrypted view to their own pod** (their data, their copy), while the room container keeps ciphertext for portability/audit. Name this tradeoff explicitly in the UI.

## The hard problem to validate first

**Concurrent Commits.** MLS allows one Commit per epoch; if two members add/remove/update simultaneously, one wins and the others must re-fetch state and retry. A pod container gives ordering by creation, but races exist and Solid has no standardized conditional-write. This is the same open problem Matrix's decentralized-MLS / MIMI work is chasing. **Spike this in week 1** with a 2-member group before building UI — if optimistic-append-and-retry is too lossy at small scale, the whole DS-on-pod premise needs rethinking (fallback: a thin ordering relay, accepting one central-ish component).

## Validation spike (do this before scaffolding a prototype)

Throwaway, headless, no UI until the end. Lives in `mind-prototypes/_spike-mls/` (scratch, deleted after), reuses the v0 CSS host on :3031, never touches `chat`. Answers two yes/no questions: (a) is there a JS/WASM MLS lib that runs a full group lifecycle and works in a browser? (b) do concurrent Commits converge with a pod container as Delivery Service?

- **Phase 0 — pick the library (verify, don't assume).** OpenMLS is Rust; confirm a usable npm artifact. Candidates: **`@wireapp/core-crypto`** (Rust+WASM, TS, production — likely winner), **`ts-mls`** (pure TS), **mls-rs** WASM. Criteria: RFC 9420, WASM/browser target, group ops + KeyPackages, license. Deliverable: a hello-world that inits the MLS provider in Node.
- **Phase 1 — MLS mechanics, zero network.** Two in-memory clients. Bob publishes a KeyPackage → Alice creates group, adds Bob, produces Commit+Welcome → Bob joins → assert plaintext round-trips both ways and epoch advances.
- **Phase 2 — pod as KeyPackage dir + ciphertext log (happy path).** `docker compose up` the v0 CSS; reuse v0 node auth for alice & bob. Bob PUTs KeyPackage to `/mls/keypackages/`; Alice GETs it, adds him, appends Commit + an encrypted app-message resource to a container; Bob lists/GETs/decrypts.
- **Phase 3 — the load-bearing test: concurrent Commits.** 3-member group at epoch N. *Construct* the forked state (two valid epoch-N Commits both land as separate resources — CSS append never rejects). Define a **deterministic tiebreak** (lowest ULID / content hash, since CSS gives no guaranteed total order); assert all three clients independently pick the same winner, apply it, and the loser detects the loss and re-applies on N+1. Measure orphaned app-messages in the racy window. **Go/no-go:** clean convergence with first-wins+retry → pod-as-DS viable; desync → need a thin ordering relay (architecture shifts).
- **Phase 4 — browser reality check (small, last).** Minimal Next 16 page, dynamic import `ssr:false`, init WASM provider in-tab, run the Phase-1 round-trip. Catches WASM/SSR/MIME bundling gotchas.

**Decision gate:** short findings note — (1) which lib, Node+browser? (2) pod-as-DS happy path? (3) concurrent-Commit convergence viable-with-retry vs needs-relay → go/no-go on `mind-securechat-v0`. ~Half a day; 0–3 are core, 4 optional.

## Deferred (same spirit as v0)

- Cross-server federation (foreign-pod members) — UMA + cross-pod KeyPackage fetch; still friction-heavy in 2026.
- Large groups / tree-DAG optimizations; presence/typing (handle ephemerally in transport, never in RDF).
- Post-quantum MLS ciphersuites (track, don't build).
- Key recovery / multi-device cross-signing UX.

## Open questions

1. `BasicCredential`-with-WebID vs X.509 — Basic is simpler and Solid-native; confirm OpenMLS WASM supports a custom credential validator that dereferences WebIDs.
2. KeyPackage exhaustion / reuse policy when a member is offline and their pod has no fresh packages.
3. Whether to keep the room owner as DS host, or rotate, or mirror the ciphertext log to every member's pod for true no-single-host durability.
4. Bundle weight of the OpenMLS WASM crypto blob in a Next.js 16 client (dynamic import, `ssr:false`).

## Decision recap

Keep Solid for **identity + archival ownership** (its real strength); adopt **MLS for the encrypted transport** (the industry convergence point); store **ciphertext in the pod**. This fixes Solid-native chat's three worst gaps at once — no E2EE, no concurrent-write safety, no presence/receipts — while preserving pod data-ownership and the cross-prototype single-WebID SSO. Full landscape + sourcing in [`research-notes.md`](./research-notes.md); this doc is the v1 architecture that follows from it.

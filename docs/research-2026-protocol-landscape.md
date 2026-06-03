# Chat protocol landscape & architecture research (2026-05-28)

_Follow-up to [`research-notes.md`](./research-notes.md) (which is the pre-v0 Solid prior-art survey). This doc captures the **2026 decision research** that produced the v1 direction in [`v1-mls-hybrid.md`](./v1-mls-hybrid.md): a Matrix evaluation, a Solid-viability check, and a survey of the broader decentralized-chat landscape. Two parallel research agents + a code review of v0. Sources are inline and grouped at the end._

## Bottom line

The defining 2026 signal is that **MLS (RFC 9420) has won the group-E2EE standards war** — Matrix, ActivityPub (Social Web Foundation), AT Protocol/Bluesky, Wire, RCS (Google/Apple), and Discord are all adopting it. The pattern the whole field has converged on is **decentralized identity + MLS transport**, with a shipping proof: [Germ](https://www.germnetwork.com/blog/germ-dm-for-at-protocol-is-live) launched native E2EE DMs on Bluesky (DID identity + MLS) in Feb 2026.

That maps onto our stack as **Solid WebID = identity, MLS = encrypted transport, pod = ciphertext archive** — which fixes Solid-native chat's three worst gaps (no E2EE, no concurrent-write safety, no presence) while preserving pod data-ownership and one-WebID SSO. Recommendation: **hybrid**, not pure-Solid-native and not wholesale-Matrix.

## v0 code review (summary)

v0 proves its thesis: real-time delivery over WebSocketChannel2023 works, long-chat RDF storage works, zero central message store. Edits/deletes/reactions match the spec. Two correctness issues regardless of future direction:

1. **Lost-update races** — `postMessage` does full-document read-modify-write PUT (`src/lib/solid/chat.ts`), so simultaneous sends silently drop a message and re-upload the whole day file (O(n) write amplification). Fix: additive N3/SPARQL `INSERT` PATCH, or one-resource-per-message in a container.
2. **Today-only history** — `listTodayMessages` and the subscription only touch today's `chat.ttl`; no prior-day load, no UTC-midnight rollover. Conversations vanish at midnight.

Scope note: v0 is a polished **single-room** demo (`config.ts` hardcodes `roomUrl`). Multi-room, room creation, LDN invites, threading, DMs, image upload are designed in the PRD but **not built**.

## Part A — Matrix evaluation

**Stronger than Solid-native on every messaging axis:** production-grade default-on E2EE (Olm/Megolm via audited Rust `vodozemac`, cross-signing, key backup, device verification; migrating to Matrix-over-MLS); purpose-built real-time (Matrix 2.0 simplified sliding sync, now native in Synapse); mature SDKs (`matrix-js-sdk` + Rust-WASM crypto runs in a React/Next.js client today); broad bridge ecosystem (mautrix); proven at EU-government scale (France Tchap ~600k, German Bundeswehr ~100k, Sweden, Belgium, an EU-Commission Teams-replacement pilot Feb 2026 — "de facto standard for EU public sector").

**Conflicts fundamentally with "data lives in the pod":**
- Message history is stored/replicated on **homeservers**, not user pods — every participant's homeserver holds a replica. Opposite of the pod model.
- **MXID (`@user:server`) is server-bound and non-portable** — no WebID equivalent, no account portability. Lose your homeserver, lose your identity + history.
- **No Solid↔Matrix bridge exists** (the one listing is an unmaintained placeholder). Buildable, but a bridge that writes plaintext to a pod **terminates Matrix's E2EE at the bridge**.
- Heavier ops (Synapse + Postgres + workers; or lighter `tuwunel`/Dendrite — note `conduwuit` was discontinued Jan 2026). The classic pain is **state-resolution cost** when joining large federated rooms.
- **Foundation finances improving but not self-sustaining** (2024: ~$561K revenue vs ~$1.2M cost; emergency $100K appeal Mar 2025; 2025 narrowed loss to ~34%), still **Element-dependent**.

**Integration seam:** Matrix's move to OIDC auth (MSC3861 + Matrix Authentication Service, mature on Synapse/tuwunel, not Dendrite/Conduit). MAS can delegate **upstream to our Solid OIDC issuer** (`codespaces-pod.duckdns.org`) — one WebID login → a Matrix session. Gives SSO continuity but does **not** make the pod own the data.

**Verdict:** strong *complement* (federation/interop + mature E2EE clients), poor *replacement* if pod-ownership of message data is a hard requirement.

## Part B — Solid viability (2026)

**Alive but narrowing, not growing in the messaging direction:**
- **Governance moved to the Open Data Institute (ODI), Oct 2024** — out from under MIT/Inrupt. Genuine de-risking, but also a signal Inrupt stepped back from the open project.
- **W3C Linked Web Storage (LWS) WG chartered 2024-09 → 2026-09** to take Solid specs (incl. Notifications) to Recommendation. Standardization *in progress, not done*.
- **Inrupt pivoted to enterprise "Agentic Wallets" / data infra for AI agents** — B2B, not consumer chat. Unlikely to produce presence/E2EE/social primitives. No major new raise since the Dec 2021 $30M Series A.
- **Notifications protocol is still a CG draft** (v0.3.0, 2024-05-12), explicitly "not a W3C Standard." WebSocketChannel2023 works on CSS v7 and ESS, but Inrupt's own docs warn the subprotocol "is subject to change." Effectively a two-server world (CSS + ESS). **Treat the notifications layer as replaceable.**
- SolidOS/long-chat tooling maintained but volunteer-paced (mashlib v2.2.0, Apr 2026).

**Hard problems — progress check (all still open for chat):**

| Problem | 2026 status |
|---|---|
| Concurrent writes on shared RDF docs | Still per-implementation; N3 Patch (INSERT/DELETE) avoids whole-doc lost-updates but no standard optimistic-concurrency primitive. Mitigate with append-only one-resource-per-message. |
| Presence / typing / read-receipts | Unsolved — Solid is a storage protocol, not a messaging one. No spec movement. |
| Public inbox (LDN) spam | Unsolved at scale; works today only because usage is tiny. |
| Cross-server federation (UMA) | Partial / friction-heavy; fine within one trust domain, brittle cross-server. |
| **E2E encryption** | **Unsolved and the biggest gap** — no de-facto Solid E2EE library; pod stores plaintext. Solid is absent from the MLS convergence. |

Solid's strengths cluster in **identity + persistent data-ownership**; its gaps cluster in **messaging**. That asymmetry is the argument for hybrid.

## Part C — Landscape comparison

| Option | Maturity | E2EE | Decentralization | Self-host cost | JS/web SDK | "User owns data" fit |
|---|---|---|---|---|---|---|
| **Solid-native (long-chat)** | Low (chat) / med (storage) | **None** | Pod-per-user (strong) | Med (CSS) | Good (`@inrupt/*`) | **Excellent (storage)** |
| Matrix | High | Olm/Megolm → MLS | Federated homeservers | Med–High | Mature | Partial |
| XMPP | Very high | OMEMO (Signal-based) | Federated | **Low** | Decent/dated | Moderate |
| Nostr | Medium | NIP-17/44 (no PCS) | **Very high (keypair)** | Very low | Good | High spirit / low SLA |
| **MLS (RFC 9420)** | High (standard) | **Best-in-class group** | Transport-agnostic | N/A (library) | OpenMLS / CoreCrypto → WASM | **Excellent building block** |
| Signal / libsignal | Highest | **Best 1:1 (PQXDH)** | None (library) | N/A | TS-over-Rust (**AGPL-3.0!**) | Good building block |
| ATProto + Germ | Med (shipping) | **MLS** | DID-based | Med | Yes | Good |
| ActivityPub + E2EE | Emerging | **MLS (planned)** | Federated | Med | Varies | Moderate |
| DIDComm / Veramo | Low–med (chat) | DID-based | DID/agent | Low–med | SSI-oriented | High (identity) |

## Part D — The hybrid (recommended) & why

MLS explicitly separates the **Delivery Service** (ordering/transport) from the **Authentication Service** (identity↔key) — exactly the seam a decentralized identity layer plugs into. The field arrived at "decentralized identity + MLS" twice in production-adjacent form in 2026: **Germ on ATProto** (live) and **Social Web Foundation's E2EE-over-ActivityPub** (announced Dec 2025, MLS chosen). **No one has done it with Solid yet** — that's the integration cost *and* the differentiation.

Mapping to our stack:
- **Identity / AS** → WebID profile docs (signature pubkey in `/profile/card`; user-owned, portable).
- **KeyPackage directory** → each user's pod (`/mls/keypackages/`, public, append-only) — the pod *is* the prekey server.
- **Delivery Service** → room's pod container + v0's WebSocketChannel2023 (no central relay).
- **Archive** → same container; `sioc:content` holds base64 `MLSMessage` ciphertext.
- **Presence/typing/receipts** → ephemeral in the transport layer, **never written to RDF**.

Library note: prefer **OpenMLS** or **Wire's `@wireapp/core-crypto`** (WASM, TS, production) — **avoid `libsignal` (AGPL-3.0)** for a closed-source product. The load-bearing unknown is **concurrent MLS Commits over a pod-as-Delivery-Service** (MLS allows one Commit/epoch; Solid has no standard conditional-write) — validate with a throwaway spike before scaffolding a prototype.

## Sources

**Matrix:** [spec v1.18](https://matrix.org/blog/2026/03/26/matrix-v1.18-release/) · [E2EE guide](https://matrix.org/docs/matrix-concepts/end-to-end-encryption/) · [vodozemac](https://github.com/matrix-org/vodozemac) · [vodozemac audit](https://matrix.org/blog/2022/05/16/independent-public-audit-of-vodozemac-a-native-rust-reference-implementation-of-matrix-end-to-end-encryption/) · [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) · [matrix-rust-sdk](https://github.com/matrix-org/matrix-rust-sdk) · [Matrix 2.0](https://matrix.org/blog/2024/10/29/matrix-2.0-is-here/) · [MAS / next-gen auth](https://github.com/element-hq/matrix-authentication-service) · [areweoidcyet.com](https://areweoidcyet.com/) · [matrix.org running MAS](https://matrix.org/blog/2025/04/morg-now-running-mas/) · [Matrix-over-MLS](https://matrix.org/blog/2023/07/a-giant-leap-with-mls/) · [tuwunel](https://github.com/matrix-construct/tuwunel) · [continuwuity](https://codeberg.org/continuwuity/continuwuity) · [Crossroads (funding)](https://matrix.org/blog/2025/02/crossroads/) · [2026 Annual Report](https://matrix.org/blog/2026/03/annual-report/) · [The Register, Feb 2026](https://www.theregister.com/2026/02/09/matrix_element_secure_chat/) · [Bundeswehr case study](https://element.io/en/case-studies/bundeswehr)

**Solid:** [Wikipedia](https://en.wikipedia.org/wiki/Solid_(web_decentralization_project)) · [ODI stewardship](https://theodi.org/insights/projects/odi-and-solid-building-a-future-where-data-works-for-everyone/) · [solid/odi-governance](https://github.com/solid/odi-governance) · [W3C LWS WG charter](https://www.w3.org/2024/09/linked-web-storage-wg-charter.html) · [Inrupt Agentic Wallets](https://www.inrupt.com/wallets/agentic-wallets) · [TechCrunch / Project Liberty](https://techcrunch.com/2025/03/10/open-web-initiatives-project-liberty-and-solid-could-be-teaming-up/) · [Notifications Protocol TR](https://solidproject.org/TR/notifications-protocol) · [WebSocketChannel2023](https://solid.github.io/notifications/websocket-channel-2023) · [CSS notifications docs](https://communitysolidserver.github.io/CommunitySolidServer/latest/usage/notifications/) · [Inrupt ESS WS](https://docs.inrupt.com/ess/2.3/services/service-notification/service-websocket) · [spec #322](https://github.com/solid/specification/issues/322) · [spec #125](https://github.com/solid/specification/issues/125) · [LDN](https://www.w3.org/TR/ldn/) · ["Baffled by Solid"](https://blog.ldodds.com/2024/03/12/baffled-by-solid/)

**MLS & landscape:** [RFC 9420](https://datatracker.ietf.org/doc/rfc9420/) · [Wikipedia MLS](https://en.wikipedia.org/wiki/Messaging_Layer_Security) · [MLS adoption trends](https://www.gopher.security/post-quantum/messaging-layer-security-adoption-trends) · [Google Messages MLS](https://chromeunboxed.com/google-messages-message-layer-security-mls/) · [OpenMLS](https://openmls.tech/) · [Germ on Bluesky (TechCrunch)](https://techcrunch.com/2026/02/18/a-startup-called-germ-becomes-the-first-private-messenger-that-launches-directly-from-blueskys-app/) · [Germ blog](https://www.germnetwork.com/blog/germ-dm-for-at-protocol-is-live) · [SWF: E2EE over ActivityPub](https://socialwebfoundation.org/2025/12/19/implementing-encrypted-messaging-over-activitypub/) · [SWICG integration models](https://swicg.github.io/activitypub-e2ee/integration-models.html) · [XMPP Newsletter Apr 2026](https://xmpp.org/2026/05/the-xmpp-newsletter-april-2026/) · [OMEMO XEP-0384](https://xmpp.org/extensions/xep-0384.html) · [Nostr NIP-17](https://nips.nostr.com/17) · [NIP-59](https://nips.nostr.com/59) · [libsignal](https://github.com/signalapp/libsignal) · [DIDComm v2](https://identity.foundation/didcomm-messaging/spec/)

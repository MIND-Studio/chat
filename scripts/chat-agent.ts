/**
 * Chat agent — let Claude join the live room AS a `mind` Solid identity and
 * converse with allowlisted humans. Backs the `/mind-join-chat-as` skill.
 *
 *   tsx scripts/chat-agent.ts <identity> whoami
 *   tsx scripts/chat-agent.ts <identity> say   "hello, world"
 *   tsx scripts/chat-agent.ts <identity> watch            # tail (resilient)
 *
 * Identity comes from the shared `~/.mind` store (see lib/mind-identity.ts) —
 * the SAME WebID you drive with `mind ls / · put · grant`, so the agent's chat
 * voice and its pod (for file create + share) are one identity.
 *
 * Room + issuer come from .env.local (NEXT_PUBLIC_ROOM_URL). The room ACL grants
 * acl:AuthenticatedAgent append, so any signed-in mind WebID can post.
 *
 * `watch` tags each NEW line:
 *   [handle] allow    — sender is on MIND_CHAT_ALLOWLIST (engage these)
 *   [handle] other    — not allowlisted (observe only; do not reply)
 *   ★@you             — the message @mentions this agent's handle (a direct ping)
 *
 * Resilience mirrors chat-watch.ts: raw turtle GET (never the swallow-on-error
 * SDK reader), 5s poll + WebSocketChannel2023 push, full session rotation every
 * 10 min (under the CSS token TTL), WS reconnect with backoff.
 *
 * Privacy (AGENTS.md): bodies print to THIS local terminal so Claude can
 * converse; nothing is logged server-side. Don't pipe this to a shared log.
 */
import { dayFileUrl } from "../src/lib/solid/chat";
import { postMessage } from "../src/lib/solid/chat";
import { loadEnvOnce } from "./lib/env";
import { handleOf, loadMindIdentity, loginMindIdentity, type MindIdentity } from "./lib/mind-identity";
import type { Session } from "@inrupt/solid-client-authn-node";

const POLL_INTERVAL_MS = 5_000;
const ROTATE_SESSION_MS = 10 * 60_000;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 15_000, 30_000];

type AuthFetch = typeof globalThis.fetch;

function roomUrl(): string {
  loadEnvOnce();
  const r = process.env.NEXT_PUBLIC_ROOM_URL;
  if (!r) throw new Error("NEXT_PUBLIC_ROOM_URL missing (set it in .env.local)");
  return r;
}

function allowlist(): Set<string> {
  // Comma-separated handles (first WebID path segment), e.g. "huhn,sven-s-workspace".
  const raw = process.env.MIND_CHAT_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function stamp(): string {
  return new Date().toISOString();
}

/** Does `body` @mention `handle`? Matches the app's mention boundary rule. */
function mentions(body: string, handle: string): boolean {
  const h = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w@])@${h}(?![\\w-])`, "i").test(body);
}

// ---- turtle extraction (copied shape from chat-watch.ts) --------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractString(block: string, iri: string): string | null {
  const re = new RegExp(`<${escapeRe(iri)}>\\s+"((?:\\\\.|[^"\\\\])*)"`, "m");
  const m = re.exec(block);
  if (!m?.[1]) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}
function extractObject(block: string, iri: string): string | null {
  const re = new RegExp(`<${escapeRe(iri)}>\\s+<([^>]+)>`, "m");
  return re.exec(block)?.[1] ?? null;
}
function extractDatetime(block: string, iri: string): string | null {
  const re = new RegExp(`<${escapeRe(iri)}>\\s+"([^"]+)"\\^\\^`, "m");
  return re.exec(block)?.[1] ?? null;
}

// ---- commands ---------------------------------------------------------------

async function cmdWhoami(id: MindIdentity, session: Session): Promise<void> {
  console.log(
    JSON.stringify(
      {
        ok: true,
        identity: id.name,
        webId: session.info.webId ?? id.webId,
        handle: handleOf(id.webId),
        podRoot: id.podRoot,
        issuer: id.issuer,
        room: roomUrl(),
        allowlist: [...allowlist()],
      },
      null,
      2,
    ),
  );
}

async function cmdSay(id: MindIdentity, session: Session, body: string): Promise<void> {
  if (!body.trim()) throw new Error('usage: chat-agent.ts <identity> say "message"');
  const msg = await postMessage(roomUrl(), body, id.webId, session.fetch as AuthFetch);
  console.log(`${handleOf(id.webId)} → ${roomUrl()}\n  ${msg.url}`);
}

async function cmdWatch(id: MindIdentity, initialSession: Session): Promise<void> {
  const me = id.webId;
  const myHandle = handleOf(me);
  const allow = allowlist();
  const seen = new Set<string>();
  let session: Session | null = initialSession;
  let fetchAs: AuthFetch | null = initialSession.fetch as AuthFetch;
  let ws: WebSocket | null = null;
  let rotateTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let reauthInFlight: Promise<void> | null = null;

  async function relogin(): Promise<void> {
    const next = await loginMindIdentity(id);
    if (session) {
      try {
        await session.logout();
      } catch {
        /* ignore */
      }
    }
    session = next;
    fetchAs = next.fetch as AuthFetch;
  }

  async function reauth(): Promise<void> {
    if (reauthInFlight) return reauthInFlight;
    reauthInFlight = (async () => {
      try {
        await relogin();
        await openWs();
        console.log(`[agent] ${stamp()} re-auth + ws re-open complete`);
        if (rotateTimer) clearTimeout(rotateTimer);
        rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
      } catch (err) {
        console.log(`[agent] ${stamp()} reauth failed: ${(err as Error).message}`);
      } finally {
        reauthInFlight = null;
      }
    })();
    return reauthInFlight;
  }

  async function pollOnce(quiet = false): Promise<void> {
    if (!fetchAs) return;
    const url = dayFileUrl(roomUrl());
    let text: string;
    try {
      const res = await fetchAs(url, { headers: { accept: "text/turtle" } });
      if (res.status === 401 || res.status === 403) {
        console.log(`[agent] ${stamp()} poll ${res.status} — re-authenticating`);
        void reauth();
        return;
      }
      if (!res.ok) {
        console.log(`[agent] ${stamp()} poll status ${res.status}`);
        return;
      }
      text = await res.text();
    } catch (err) {
      console.log(`[agent] ${stamp()} poll error: ${(err as Error).message}`);
      return;
    }
    const found: { url: string; body: string; author: string; createdAt: string }[] = [];
    for (const chunk of text.split(/(?=<#msg-)/)) {
      if (!chunk.startsWith("<#msg-")) continue;
      const fragEnd = chunk.indexOf(">");
      if (fragEnd < 0) continue;
      const subjUrl = `${url}${chunk.slice(1, fragEnd)}`;
      if (seen.has(subjUrl)) continue;
      const body = extractString(chunk, "http://rdfs.org/sioc/ns#content");
      const author = extractObject(chunk, "http://xmlns.com/foaf/0.1/maker");
      const createdAt = extractDatetime(chunk, "http://purl.org/dc/terms/created");
      if (!body || !author || !createdAt) continue;
      found.push({ url: subjUrl, body, author, createdAt });
    }
    found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const m of found) {
      seen.add(m.url);
      if (quiet) continue; // bootstrap: record history, print nothing
      const h = handleOf(m.author);
      if (m.author === me || h === myHandle) {
        // our own line — record but don't tag for reply
        console.log(`${m.createdAt} [${h}] self ${oneLine(m.body)}`);
        continue;
      }
      const tier = allow.has(h.toLowerCase()) ? "allow" : "other";
      const ping = mentions(m.body, myHandle) ? " ★@you" : "";
      console.log(`${m.createdAt} [${h}] ${tier}${ping} ${oneLine(m.body)}`);
    }
  }

  async function openWs(): Promise<void> {
    if (!fetchAs) return;
    const dayUrl = dayFileUrl(roomUrl());
    const origin = new URL(dayUrl).origin;
    let receiveFrom: string;
    try {
      const subRes = await fetchAs(`${origin}/.notifications/WebSocketChannel2023/`, {
        method: "POST",
        headers: { "content-type": "application/ld+json" },
        body: JSON.stringify({
          "@context": ["https://www.w3.org/ns/solid/notification/v1"],
          type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
          topic: dayUrl,
        }),
      });
      if (!subRes.ok) throw new Error(`POST ${subRes.status}`);
      const body = (await subRes.json()) as { receiveFrom?: string };
      if (!body.receiveFrom) throw new Error("missing receiveFrom");
      receiveFrom = body.receiveFrom;
    } catch (err) {
      console.log(`[agent] ${stamp()} ws subscribe failed: ${(err as Error).message}`);
      scheduleReconnect();
      return;
    }
    ws?.close();
    const sock = new WebSocket(receiveFrom);
    ws = sock;
    sock.addEventListener("open", () => {
      console.log(`[agent] ${stamp()} ws open`);
      reconnectAttempt = 0;
    });
    sock.addEventListener("message", () => void pollOnce());
    sock.addEventListener("close", () => {
      if (sock !== ws) return;
      console.log(`[agent] ${stamp()} ws closed; reconnecting`);
      scheduleReconnect();
    });
    sock.addEventListener("error", (e) => {
      console.log(`[agent] ${stamp()} ws error: ${String(e)}`);
    });
  }

  function scheduleReconnect() {
    const d = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    reconnectAttempt++;
    setTimeout(() => void openWs(), d);
  }

  async function rotate(): Promise<void> {
    try {
      await relogin();
      await openWs();
      console.log(`[agent] ${stamp()} session rotated`);
    } catch (err) {
      console.log(`[agent] ${stamp()} rotation failed: ${(err as Error).message}; retry 30s`);
      setTimeout(() => void rotate(), 30_000);
      return;
    }
    rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
  }

  // Bootstrap: seed `seen` silently so we only print NEW lines after the banner.
  await pollOnce(true);
  console.log(
    `[agent] ${stamp()} ${id.name} (@${myHandle}) watching ${dayFileUrl(roomUrl())}` +
      ` · allow=[${[...allow].join(",") || "—"}] · seeded ${seen.size} · ↓ lines below are NEW`,
  );
  setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
  await openWs();
  await new Promise<void>(() => {}); // keep alive
}

function oneLine(body: string): string {
  return body.replace(/\r?\n/g, " ⏎ ");
}

async function main(): Promise<void> {
  const idName = process.argv[2];
  const cmd = (process.argv[3] ?? "").toLowerCase();
  if (!idName || !cmd) {
    throw new Error('usage: tsx scripts/chat-agent.ts <identity> <whoami|say|watch> [args]');
  }
  const id = loadMindIdentity(idName);
  const session = await loginMindIdentity(id);

  if (cmd === "whoami") return cmdWhoami(id, session);
  if (cmd === "say") return cmdSay(id, session, process.argv.slice(4).join(" "));
  if (cmd === "watch") return cmdWatch(id, session);
  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: (err as Error).message }));
  process.exit(1);
});

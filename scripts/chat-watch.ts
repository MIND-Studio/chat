/**
 * Watch the room as persona B. Subscribes via WebSocketChannel2023 and
 * prints every new message with author tag.
 *
 * Resilience strategy (informed by silent failures in v1 + v2):
 *   - Re-create the entire session + WS subscription every 20 minutes.
 *     This is shorter than any reasonable CSS access-token TTL, so we never
 *     hit the "auth expired -> getSolidDataset silently returns [] -> we
 *     think there are no new messages" trap.
 *   - Direct GET of today's chat.ttl every 5s (cheap turtle parse), never
 *     via the swallow-errors listTodayMessages helper.
 *   - On any poll failure, log loudly with status code.
 *   - WebSocket reconnect on close, with backoff.
 *
 * Usage: tsx scripts/chat-watch.ts
 */
import { dayFileUrl } from "../src/lib/solid/chat";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";
import type { Session } from "@inrupt/solid-client-authn-node";

const POLL_INTERVAL_MS = 5_000;
const ROTATE_SESSION_MS = 10 * 60_000;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 15_000, 30_000];

type AuthFetch = typeof globalThis.fetch;

async function main(): Promise<void> {
  const env = readEnv();
  const me = env.personaB;
  const seen = new Set<string>();
  let session: Session | null = null;
  let fetchAs: AuthFetch | null = null;
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let rotateTimer: ReturnType<typeof setTimeout> | null = null;

  async function login(): Promise<void> {
    console.log(`[watch] ${stamp()} signing in as ${me.email}`);
    const next = await loginAsCssUser({
      issuer: env.issuer,
      email: me.email,
      password: me.password,
      webId: me.webId,
    });
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

  /**
   * Direct turtle GET + regex-extract of message resources. Bypasses
   * @inrupt/solid-client to avoid its swallow-on-error behaviour.
   *
   * Inrupt's serializer writes subjects as document-relative `<#msg-XYZ>`
   * and predicates as full IRIs. Each message subject is followed by
   * three triples (sioc:content, foaf:maker, dct:created) terminated by a
   * `.` at the end. We split on the subject token boundary and parse
   * each chunk independently.
   */
  let reauthInFlight: Promise<void> | null = null;
  async function reauth(): Promise<void> {
    if (reauthInFlight) return reauthInFlight;
    reauthInFlight = (async () => {
      try {
        await login();
        await openWs();
        console.log(`[watch] ${stamp()} re-auth + ws re-open complete`);
        // Reset rotation timer.
        if (rotateTimer) clearTimeout(rotateTimer);
        rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
      } catch (err) {
        console.log(`[watch] ${stamp()} reauth failed: ${(err as Error).message}`);
      } finally {
        reauthInFlight = null;
      }
    })();
    return reauthInFlight;
  }

  async function pollOnce(): Promise<void> {
    if (!fetchAs) return;
    const url = dayFileUrl(env.roomUrl);
    let text: string;
    try {
      const res = await fetchAs(url, { headers: { accept: "text/turtle" } });
      if (res.status === 401 || res.status === 403) {
        console.log(`[watch] ${stamp()} poll ${res.status} — re-authenticating`);
        void reauth();
        return;
      }
      if (!res.ok) {
        console.log(`[watch] ${stamp()} poll status ${res.status} on ${url}`);
        return;
      }
      text = await res.text();
    } catch (err) {
      console.log(`[watch] ${stamp()} poll error: ${(err as Error).message}`);
      return;
    }
    const found: { url: string; body: string; author: string; createdAt: string }[] = [];
    const chunks = text.split(/(?=<#msg-)/);
    for (const chunk of chunks) {
      if (!chunk.startsWith("<#msg-")) continue;
      const fragEnd = chunk.indexOf(">");
      if (fragEnd < 0) continue;
      const fragment = chunk.slice(1, fragEnd); // e.g. #msg-019e...
      const subjUrl = `${url}${fragment}`;
      if (seen.has(subjUrl)) continue;
      const body = extractFullIriString(chunk, "http://rdfs.org/sioc/ns#content");
      const author = extractFullIriObject(chunk, "http://xmlns.com/foaf/0.1/maker");
      const createdAt = extractFullIriDatetime(chunk, "http://purl.org/dc/terms/created");
      if (!body || !author || !createdAt) continue;
      found.push({ url: subjUrl, body, author, createdAt });
    }
    // Sort by createdAt so prints stay chronological even if turtle order varies.
    found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const m of found) {
      seen.add(m.url);
      const isSelf = m.author === me.webId;
      const who = isSelf ? "[me/bob]" : `[${shortWebid(m.author)}]`;
      // Single-line output — newlines in the body would otherwise produce
      // continuation lines that look untagged to grep-based filters.
      const singleLine = m.body.replace(/\r?\n/g, " ⏎ ");
      console.log(`${m.createdAt} ${who} ${singleLine}`);
    }
  }

  async function openWs(): Promise<void> {
    if (!fetchAs) return;
    const dayUrl = dayFileUrl(env.roomUrl);
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
      if (!subRes.ok) throw new Error(`POST ${subRes.status}: ${(await subRes.text()).slice(0, 200)}`);
      const body = (await subRes.json()) as { receiveFrom?: string };
      if (!body.receiveFrom) throw new Error("missing receiveFrom");
      receiveFrom = body.receiveFrom;
    } catch (err) {
      console.log(`[watch] ${stamp()} ws subscribe failed: ${(err as Error).message}`);
      scheduleReconnect();
      return;
    }
    ws?.close();
    const sock = new WebSocket(receiveFrom);
    ws = sock;
    sock.addEventListener("open", () => {
      console.log(`[watch] ${stamp()} ws open ${new URL(receiveFrom).pathname.split("/").pop()}`);
      reconnectAttempt = 0;
    });
    sock.addEventListener("message", () => {
      void pollOnce();
    });
    sock.addEventListener("close", () => {
      if (sock !== ws) return; // we already replaced it
      console.log(`[watch] ${stamp()} ws closed; reconnecting`);
      scheduleReconnect();
    });
    sock.addEventListener("error", (e) => {
      console.log(`[watch] ${stamp()} ws error: ${String(e)}`);
    });
  }

  let reconnectAttempt = 0;
  function scheduleReconnect() {
    const d =
      RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 30_000;
    reconnectAttempt++;
    setTimeout(() => {
      void openWs();
    }, d);
  }

  async function rotate(): Promise<void> {
    try {
      await login();
      await openWs();
      console.log(`[watch] ${stamp()} session rotated`);
    } catch (err) {
      console.log(`[watch] ${stamp()} rotation failed: ${(err as Error).message}; will retry in 30s`);
      setTimeout(() => void rotate(), 30_000);
      return;
    }
    rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
  }

  // Bootstrap.
  await login();
  // Seed silently with what already exists so we only log new messages.
  await pollOnce(); // populates `seen` and logs anything new (initial pass)
  console.log(`[watch] ${stamp()} seeded with ${seen.size} message(s); listening on ${dayFileUrl(env.roomUrl)}`);

  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
  rotateTimer = setTimeout(() => void rotate(), ROTATE_SESSION_MS);
  await openWs();

  // Keep alive forever.
  await new Promise<void>(() => {});
  // unreachable, but keeps tsc happy:
  if (pollTimer) clearInterval(pollTimer);
  if (rotateTimer) clearTimeout(rotateTimer);
}

function stamp(): string {
  return new Date().toISOString();
}

function shortWebid(webid: string): string {
  try {
    const u = new URL(webid);
    return u.pathname.split("/").filter(Boolean)[0] ?? webid;
  } catch {
    return webid;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFullIriString(block: string, iri: string): string | null {
  // Predicate is `<IRI>` followed by a string literal.
  const re = new RegExp(`<${escapeRe(iri)}>\\s+"((?:\\\\.|[^"\\\\])*)"`, "m");
  const m = re.exec(block);
  if (!m?.[1]) return null;
  return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}

function extractFullIriObject(block: string, iri: string): string | null {
  const re = new RegExp(`<${escapeRe(iri)}>\\s+<([^>]+)>`, "m");
  const m = re.exec(block);
  return m?.[1] ?? null;
}

function extractFullIriDatetime(block: string, iri: string): string | null {
  const re = new RegExp(`<${escapeRe(iri)}>\\s+"([^"]+)"\\^\\^`, "m");
  const m = re.exec(block);
  return m?.[1] ?? null;
}

main().catch((err) => {
  console.error("[watch] fatal:", err);
  process.exit(1);
});

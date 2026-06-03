/**
 * Protocol-level end-to-end smoke test:
 *   1. Sign in as both personas via CSS account API.
 *   2. Ensure the demo room exists and persona B has ACL access.
 *   3. Persona B subscribes to today's chat file via WebSocketChannel2023.
 *   4. Persona A posts a probe message.
 *   5. Verify persona B receives the notification AND can read the new
 *      message via their authenticated fetch.
 *
 * Reads target URLs and credentials from .env / .env.local.
 * Usage: npm run smoke:roundtrip
 */
import {
  dayFileUrl,
  ensureRoom,
  ensureTodayFile,
  listTodayMessages,
  postMessage,
} from "../src/lib/solid/chat";
import { writeRoomAcl } from "../src/lib/solid/chat-acl";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

const NOTIFY_TIMEOUT_MS = 15_000;

type AuthFetch = typeof globalThis.fetch;

async function subscribeRaw(
  topicUrl: string,
  fetch: AuthFetch,
): Promise<{ receiveFrom: string; ws: WebSocket }> {
  const origin = new URL(topicUrl).origin;
  const subscribeUrl = `${origin}/.notifications/WebSocketChannel2023/`;

  const res = await fetch(subscribeUrl, {
    method: "POST",
    headers: { "content-type": "application/ld+json" },
    body: JSON.stringify({
      "@context": ["https://www.w3.org/ns/solid/notification/v1"],
      type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
      topic: topicUrl,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`subscription POST failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const body = (await res.json()) as { receiveFrom?: string };
  if (!body.receiveFrom) throw new Error("subscription response missing receiveFrom");

  const ws = new WebSocket(body.receiveFrom);
  return { receiveFrom: body.receiveFrom, ws };
}

async function main(): Promise<void> {
  const env = readEnv();
  console.log("smoke: target =", env.issuer);

  console.log("[1/5] sign in as both personas");
  const [a, b] = await Promise.all([
    loginAsCssUser({
      issuer: env.issuer,
      email: env.personaA.email,
      password: env.personaA.password,
      webId: env.personaA.webId,
    }),
    loginAsCssUser({
      issuer: env.issuer,
      email: env.personaB.email,
      password: env.personaB.password,
      webId: env.personaB.webId,
    }),
  ]);
  const aFetch = a.fetch as AuthFetch;
  const bFetch = b.fetch as AuthFetch;
  console.log("    A =", a.info.webId);
  console.log("    B =", b.info.webId);

  console.log("[2/5] ensure room + ACL + today file");
  await ensureRoom(env.roomUrl, "General", env.personaA.webId, aFetch);
  await writeRoomAcl(env.roomUrl, env.personaA.webId, [env.personaB.webId], aFetch);
  await ensureTodayFile(env.roomUrl, aFetch);

  const bInitial = await listTodayMessages(env.roomUrl, bFetch);
  console.log(`    B can read room — ${bInitial.length} existing message(s)`);

  console.log("[3/5] B subscribes via WebSocketChannel2023");
  const dayUrl = dayFileUrl(env.roomUrl);
  const { receiveFrom, ws } = await subscribeRaw(dayUrl, bFetch);
  console.log("    receiveFrom =", receiveFrom);

  const ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws open timeout")), 8_000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(t);
      reject(new Error(`ws error: ${String(e)}`));
    });
  });
  await ready;
  console.log("    B's WebSocket open");

  const notified = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no notification within ${NOTIFY_TIMEOUT_MS}ms`)),
      NOTIFY_TIMEOUT_MS,
    );
    ws.addEventListener("message", (ev) => {
      clearTimeout(timer);
      resolve(ev.data);
    });
  });

  console.log("[4/5] A posts a probe message");
  const probe = `smoke-${Date.now()}`;
  const t0 = Date.now();
  await postMessage(env.roomUrl, probe, env.personaA.webId, aFetch);

  console.log("[5/5] wait for B's notification + read-back");
  const payload = await notified;
  const tNotified = Date.now();
  console.log(`    B received notification in ${tNotified - t0}ms`);
  const payloadStr = typeof payload === "string" ? payload : String(payload);
  console.log(`    notification payload (truncated): ${payloadStr.slice(0, 200)}`);

  const after = await listTodayMessages(env.roomUrl, bFetch);
  const found = after.find((m) => m.body === probe);
  if (!found) {
    throw new Error(`probe message "${probe}" not visible to B after notification`);
  }
  console.log(`    B's read-back found the probe (author=${found.author})`);

  ws.close();
  await Promise.all([a.logout(), b.logout()]);
  console.log("\n✓ end-to-end round-trip OK");
}

main().catch((err) => {
  console.error("\n✗ smoke-roundtrip failed:", err);
  process.exit(1);
});

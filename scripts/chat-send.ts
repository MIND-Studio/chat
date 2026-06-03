/**
 * Send a message as persona B (the "other" persona) and exit.
 *
 * Usage:  tsx scripts/chat-send.ts "your message here"
 *         tsx scripts/chat-send.ts -- multi word message also works
 */
import { postMessage } from "../src/lib/solid/chat";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const text = args.join(" ").trim();
  if (!text) {
    console.error("Usage: tsx scripts/chat-send.ts <message text>");
    process.exit(2);
  }

  const env = readEnv();
  const me = env.personaB;
  const session = await loginAsCssUser({
    issuer: env.issuer,
    email: me.email,
    password: me.password,
    webId: me.webId,
  });
  const fetch = session.fetch as typeof globalThis.fetch;

  const msg = await postMessage(env.roomUrl, text, me.webId, fetch);
  console.log(`sent ${msg.url}`);
  await session.logout();
}

main().catch((err) => {
  console.error("send failed:", err);
  process.exit(1);
});

import { listTodayMessages } from "../src/lib/solid/chat";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

(async () => {
  const env = readEnv();
  const s = await loginAsCssUser({ issuer: env.issuer, email: env.personaB.email, password: env.personaB.password, webId: env.personaB.webId });
  const msgs = await listTodayMessages(env.roomUrl, s.fetch as typeof globalThis.fetch);
  const latest = msgs.slice(-10);
  for (const m of latest) {
    const who = new URL(m.author).pathname.split("/").filter(Boolean)[0] ?? m.author;
    console.log(`${m.createdAtIso} [${who}] ${m.body}`);
  }
  await s.logout();
})().catch((e: unknown) => { console.error(e); process.exit(1); });

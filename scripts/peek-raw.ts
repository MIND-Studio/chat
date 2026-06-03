import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";
import { dayFileUrl } from "../src/lib/solid/chat";

(async () => {
  const env = readEnv();
  const s = await loginAsCssUser({ issuer: env.issuer, email: env.personaB.email, password: env.personaB.password, webId: env.personaB.webId });
  const f = s.fetch as typeof globalThis.fetch;
  const res = await f(dayFileUrl(env.roomUrl), { headers: { accept: "text/turtle" } });
  console.log("status", res.status);
  const text = await res.text();
  console.log("--- last 1500 chars ---");
  console.log(text.slice(-1500));
  await s.logout();
})().catch(e => { console.error(e); process.exit(1); });

import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

(async () => {
  const env = readEnv();
  const me = env.personaB;
  const s = await loginAsCssUser({
    issuer: env.issuer,
    email: me.email,
    password: me.password,
    webId: me.webId,
  });
  const f = s.fetch as typeof globalThis.fetch;

  async function rawTurtle(url: string): Promise<string> {
    const res = await f(url, { headers: { accept: "text/turtle" } });
    if (!res.ok) return `[${res.status} ${res.statusText}]`;
    return await res.text();
  }

  const room = env.roomUrl.endsWith("/") ? env.roomUrl : `${env.roomUrl}/`;
  for (const path of [room, room + "2026/", room + "2026/05/", room + "2026/05/26/"]) {
    console.log("\n=== " + path);
    const text = await rawTurtle(path);
    console.log(text.slice(0, 800));
  }

  await s.logout();
})().catch((e: unknown) => { console.error(e); process.exit(1); });

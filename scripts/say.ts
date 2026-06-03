/**
 * Dev helper: post a message into the demo room as persona A or B.
 *
 *   tsx scripts/say.ts b "hello from bob"
 *   tsx scripts/say.ts a "hi bob"
 *
 * Handy for driving a two-party conversation while watching the UI as the
 * other identity. Reuses the same CSS client-credentials auth as the seeds.
 */
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv, type PersonaEnv } from "./lib/env";
import { postMessage } from "../src/lib/solid/chat";

async function main(): Promise<void> {
  const which = (process.argv[2] ?? "b").toLowerCase();
  const body = process.argv.slice(3).join(" ").trim();
  if (!body) throw new Error('usage: tsx scripts/say.ts <a|b> "message"');

  const env = readEnv();
  const persona: PersonaEnv = which === "a" ? env.personaA : env.personaB;

  const session = await loginAsCssUser({
    issuer: env.issuer,
    email: persona.email,
    password: persona.password,
    webId: persona.webId,
  });

  const msg = await postMessage(
    env.roomUrl,
    body,
    persona.webId,
    session.fetch as typeof globalThis.fetch,
  );
  console.log(`${persona.name} → ${env.roomUrl}\n  ${msg.url}\n  "${body}"`);
}

main().catch((err) => {
  console.error("say failed:", err);
  process.exit(1);
});

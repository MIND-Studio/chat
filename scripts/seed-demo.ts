/**
 * Provision the demo room on persona A's pod, grant persona B read+append,
 * and write a few opening messages.
 *
 * Reads target URLs and credentials from .env / .env.local. Works against
 * either the localhost CSS or the live pod — same script, different env.
 *
 * Idempotent. Usage: npm run seed:demo
 */
import {
  ensureRoom,
  ensureTodayFile,
  postMessage,
} from "../src/lib/solid/chat";
import { writeRoomAcl } from "../src/lib/solid/chat-acl";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

async function main(): Promise<void> {
  const env = readEnv();
  console.log("seed-demo: target issuer =", env.issuer);
  console.log("seed-demo: room URL      =", env.roomUrl);
  console.log("seed-demo: room owner    =", env.personaA.webId);
  console.log("seed-demo: room member   =", env.personaB.webId);

  console.log("\nseed-demo: signing in as room owner (" + env.personaA.email + ")");
  const ownerSession = await loginAsCssUser({
    issuer: env.issuer,
    email: env.personaA.email,
    password: env.personaA.password,
    webId: env.personaA.webId,
  });
  const ownerFetch = ownerSession.fetch as typeof globalThis.fetch;

  console.log("seed-demo: ensuring room descriptor");
  await ensureRoom(env.roomUrl, "General", env.personaA.webId, ownerFetch);

  console.log(
    "seed-demo: writing ACL granting",
    env.personaB.webId,
    "+ any authenticated agent read+append",
  );
  await writeRoomAcl(env.roomUrl, env.personaA.webId, [env.personaB.webId], ownerFetch, {
    authenticatedAppend: true,
  });

  console.log("seed-demo: ensuring today's chat file exists");
  await ensureTodayFile(env.roomUrl, ownerFetch);

  console.log("seed-demo: writing opening messages");
  await postMessage(
    env.roomUrl,
    `Hey ${env.personaB.name}, welcome to the demo room.`,
    env.personaA.webId,
    ownerFetch,
  );
  await postMessage(
    env.roomUrl,
    "Anything you send here lands in my pod — the ACL grants you append, so you can reply.",
    env.personaA.webId,
    ownerFetch,
  );

  console.log("\nseed-demo: done. Room is at", env.roomUrl);
  await ownerSession.logout();
}

main().catch((err) => {
  console.error("seed-demo failed:", err);
  process.exit(1);
});

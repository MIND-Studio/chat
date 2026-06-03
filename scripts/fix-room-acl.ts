/**
 * Rewrite ONLY the demo room's WAC ACL — grant the owner Control, the named
 * member Read+Append, and any authenticated agent Read+Append (the shared
 * "post as yourself" demo-room model). Unlike `seed:demo` this does not
 * re-post welcome messages, so it's safe to re-run against a live room.
 *
 * Reads target URL + owner credentials from .env / .env.local. Point these
 * at the live pod (pod.mindpods.org, owner = testuser) to fix the live room.
 *
 * Usage: npm run fix:acl
 */
import { writeRoomAcl } from "../src/lib/solid/chat-acl";
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv } from "./lib/env";

async function main(): Promise<void> {
  const env = readEnv();
  console.log("fix-room-acl: target issuer =", env.issuer);
  console.log("fix-room-acl: room URL      =", env.roomUrl);
  console.log("fix-room-acl: room owner    =", env.personaA.webId);
  console.log("fix-room-acl: member        =", env.personaB.webId);

  console.log("\nfix-room-acl: signing in as room owner (" + env.personaA.email + ")");
  const ownerSession = await loginAsCssUser({
    issuer: env.issuer,
    email: env.personaA.email,
    password: env.personaA.password,
    webId: env.personaA.webId,
  });
  const ownerFetch = ownerSession.fetch as typeof globalThis.fetch;

  console.log("fix-room-acl: writing ACL (member + any authenticated agent read+append)");
  await writeRoomAcl(env.roomUrl, env.personaA.webId, [env.personaB.webId], ownerFetch, {
    authenticatedAppend: true,
  });

  console.log("\nfix-room-acl: done. Any signed-in WebID can now post to", env.roomUrl);
  await ownerSession.logout();
}

main().catch((err) => {
  console.error("fix-room-acl failed:", err);
  process.exit(1);
});

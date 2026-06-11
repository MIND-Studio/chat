/**
 * Create the app-owned feedback inbox container and its public-append WAC ACL.
 *
 * Model: feedback is collected in ONE container the app developer owns, with a
 * public-append ACL — anyone (even logged-out / pod-less users) can POST a
 * feedback resource, but only the owner can list/read them. This is what the
 * `@mind-studio/core/feedback` widget writes to and the triage agent reads.
 *
 * The inbox URL comes from NEXT_PUBLIC_FEEDBACK_INBOX (.env.local); the owner is
 * persona A. Safe to re-run — it just rewrites the container + ACL.
 *
 * Usage: npm run seed:feedback
 */
import { loginAsCssUser } from "./lib/css-auth";
import { readEnv, loadEnvOnce } from "./lib/env";

async function main(): Promise<void> {
  loadEnvOnce();
  const env = readEnv();
  const inbox = (process.env.NEXT_PUBLIC_FEEDBACK_INBOX ?? "").replace(/\/?$/, "/");
  if (!inbox) throw new Error("NEXT_PUBLIC_FEEDBACK_INBOX is not set");

  console.log("seed-feedback: inbox =", inbox);
  console.log("seed-feedback: owner =", env.personaA.webId);

  const session = await loginAsCssUser({
    issuer: env.issuer,
    email: env.personaA.email,
    password: env.personaA.password,
    webId: env.personaA.webId,
  });
  const fetch = session.fetch as typeof globalThis.fetch;

  // 1) Ensure the container exists.
  const mk = await fetch(inbox, {
    method: "PUT",
    headers: {
      "content-type": "text/turtle",
      link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
    },
  });
  if (!mk.ok && mk.status !== 205) {
    throw new Error(`container create failed: ${mk.status} ${mk.statusText}`);
  }
  console.log("seed-feedback: container ready");

  // 2) Public-append ACL: owner full Control+Read; everyone else Append only.
  const ttl = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#owner>
  a acl:Authorization;
  acl:agent <${env.personaA.webId}>;
  acl:accessTo <./>;
  acl:default <./>;
  acl:mode acl:Read, acl:Write, acl:Append, acl:Control.

<#public>
  a acl:Authorization;
  acl:agentClass foaf:Agent;
  acl:accessTo <./>;
  acl:default <./>;
  acl:mode acl:Append.
`;
  const aclRes = await fetch(`${inbox}.acl`, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body: ttl,
  });
  if (!aclRes.ok && aclRes.status !== 205) {
    throw new Error(`ACL write failed: ${aclRes.status} ${aclRes.statusText}`);
  }

  console.log("\nseed-feedback: done. Anyone can append; only the owner can read.");
  await session.logout();
}

main().catch((err) => {
  console.error("seed-feedback failed:", err);
  process.exit(1);
});

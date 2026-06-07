/**
 * Provision the per-app feedback inboxes for the WHOLE fleet in one run.
 *
 * Each Mind app's feedback widget (`@mind-studio/core/feedback`) POSTs to a
 * public-append container the app developer owns:
 *
 *     {ownerPod}/{app}-feedback/
 *
 * with an ACL that lets ANYONE append a feedback resource but only the owner
 * read/list them. This script creates that container + ACL for every app, all
 * owned by a single fleet account (in prod: `mind` on pods.mindpods.org). It is
 * the fleet-wide companion to `seed-feedback-inbox.ts` (which does one inbox
 * from chat's own env) and is safe to re-run — it just rewrites container+ACL.
 *
 * Usage (prod — fill in the mind account's CSS credentials):
 *
 *   cd chat
 *   FEEDBACK_OWNER_EMAIL="<mind CSS email>" \
 *   FEEDBACK_OWNER_PASSWORD="<mind CSS password>" \
 *   FEEDBACK_ISSUER=https://pods.mindpods.org/ \
 *   FEEDBACK_OWNER_WEBID=https://pods.mindpods.org/mind/profile/card#me \
 *   FEEDBACK_OWNER_POD=https://pods.mindpods.org/mind/ \
 *   npm run seed:feedback:all
 *
 * Defaults target the prod `mind` pod, so in practice only the two secrets
 * (EMAIL/PASSWORD) are strictly required. Override APPS to scope the run.
 */
import { loginAsCssUser } from "./lib/css-auth";

const ISSUER = (process.env.FEEDBACK_ISSUER ?? "https://pods.mindpods.org/").replace(/\/?$/, "/");
const OWNER_POD = (process.env.FEEDBACK_OWNER_POD ?? "https://pods.mindpods.org/mind/").replace(/\/?$/, "/");
const OWNER_WEBID =
  process.env.FEEDBACK_OWNER_WEBID ?? "https://pods.mindpods.org/mind/profile/card#me";
const EMAIL = required("FEEDBACK_OWNER_EMAIL");
const PASSWORD = required("FEEDBACK_OWNER_PASSWORD");

// The fleet apps that ship the feedback widget. Keep in sync with the
// NEXT_PUBLIC_FEEDBACK_INBOX build-args in each app's release.yml.
const APPS = (process.env.FEEDBACK_APPS ?? "chat,drive,builder,dock,whiteboard,codespaces")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required env var missing: ${name}`);
  return v;
}

function aclTtl(): string {
  return `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#owner>
  a acl:Authorization;
  acl:agent <${OWNER_WEBID}>;
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
}

async function provision(fetch: typeof globalThis.fetch, inbox: string): Promise<void> {
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

  // 2) Public-append ACL: owner full Control+Read; everyone else Append only.
  const aclRes = await fetch(`${inbox}.acl`, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body: aclTtl(),
  });
  if (!aclRes.ok && aclRes.status !== 205) {
    throw new Error(`ACL write failed: ${aclRes.status} ${aclRes.statusText}`);
  }
}

async function main(): Promise<void> {
  console.log("seed-feedback-all: issuer =", ISSUER);
  console.log("seed-feedback-all: owner  =", OWNER_WEBID);
  console.log("seed-feedback-all: apps   =", APPS.join(", "));

  const session = await loginAsCssUser({ issuer: ISSUER, email: EMAIL, password: PASSWORD, webId: OWNER_WEBID });
  const fetch = session.fetch as typeof globalThis.fetch;

  for (const app of APPS) {
    const inbox = `${OWNER_POD}${app}-feedback/`;
    process.stdout.write(`  ${app.padEnd(12)} ${inbox} ... `);
    await provision(fetch, inbox);
    console.log("ok");
  }

  await session.logout();
  console.log("\nseed-feedback-all: done. Anyone can append; only the owner can read.");
}

main().catch((err) => {
  console.error("seed-feedback-all failed:", err);
  process.exit(1);
});

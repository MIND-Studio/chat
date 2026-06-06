/**
 * Load a Solid identity from the shared `mind` CLI store (`~/.mind/identities/
 * <name>.json`) and return an authenticated Inrupt session for it.
 *
 * This is the bridge that lets the chat agent act AS a real `mind` WebID —
 * the same identity you drive from the terminal with `mind ls / · put · grant`.
 * One identity, two surfaces: chat (this engine) + pod file I/O (the CLI).
 *
 * Never print clientSecret/password. We only read the fields login needs.
 */
import { Session } from "@inrupt/solid-client-authn-node";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MindIdentity = {
  name: string;
  issuer: string;
  webId: string;
  podRoot: string;
  clientId: string;
  clientSecret: string;
};

export function mindHome(): string {
  return process.env.MIND_HOME || join(homedir(), ".mind");
}

/** First non-empty path segment of a WebID — the chat "handle" (matches the
 * app's shortName() and the @mention model). */
export function handleOf(webid: string): string {
  try {
    return new URL(webid).pathname.split("/").filter(Boolean)[0] ?? webid;
  } catch {
    return webid;
  }
}

export function loadMindIdentity(name: string): MindIdentity {
  const file = join(mindHome(), "identities", `${name}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `No mind identity "${name}" at ${file}.\n` +
        `Create one on prod with:\n` +
        `  mind id create ${name} --issuer https://pods.mindpods.org/`,
    );
  }
  const j = JSON.parse(raw) as Record<string, string>;
  for (const k of ["issuer", "webId", "clientId", "clientSecret"] as const) {
    if (!j[k]) throw new Error(`mind identity "${name}" is missing "${k}"`);
  }
  return {
    name,
    issuer: j.issuer!,
    webId: j.webId!,
    podRoot: j.podRoot ?? "",
    clientId: j.clientId!,
    clientSecret: j.clientSecret!,
  };
}

export async function loginMindIdentity(id: MindIdentity): Promise<Session> {
  const session = new Session();
  await session.login({
    oidcIssuer: id.issuer,
    clientId: id.clientId,
    clientSecret: id.clientSecret,
    tokenType: "DPoP",
  });
  if (!session.info.isLoggedIn) {
    throw new Error(
      `login failed for "${id.name}" @ ${id.issuer} — is the pod up and are the creds current?`,
    );
  }
  return session;
}

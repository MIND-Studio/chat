import { Session } from "@inrupt/solid-client-authn-node";

/**
 * Authenticate against a Community Solid Server instance and return an
 * Inrupt Session whose `.fetch` is authenticated as the given account.
 *
 * Flow (per https://communitysolidserver.github.io/CommunitySolidServer/7.x/usage/client-credentials/):
 *   1. POST email/password → /.account/login/password/ → cookie/token
 *   2. POST /.account/credentials/ with the token → client_id + client_secret
 *   3. Use client_id/secret to log in via solid-client-authn-node Session
 */
export async function loginAsCssUser(opts: {
  issuer: string;
  email: string;
  password: string;
  /**
   * The WebID to bind the minted client credentials to. Required when the
   * email's local-part doesn't match the pod name (e.g. test@test.de owning
   * a pod at /testuser/). If omitted, falls back to deriving from the email.
   */
  webId?: string;
}): Promise<Session> {
  const issuer = opts.issuer.endsWith("/") ? opts.issuer : `${opts.issuer}/`;

  // Step 1: discover the account API controls.
  const indexRes = await fetch(`${issuer}.account/`);
  if (!indexRes.ok) {
    throw new Error(`Account API discovery failed: ${indexRes.status}`);
  }
  const indexBody = (await indexRes.json()) as {
    controls?: { password?: { login?: string }; account?: { clientCredentials?: string } };
  };
  const loginUrl = indexBody?.controls?.password?.login;
  if (!loginUrl) {
    throw new Error(`No password login control at ${issuer}.account/`);
  }

  // Step 2: log in with email/password to get an account token.
  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: opts.email, password: opts.password }),
  });
  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`CSS login failed (${loginRes.status}): ${text}`);
  }
  const loginBody = (await loginRes.json()) as { authorization?: string };
  if (!loginBody.authorization) {
    throw new Error("CSS login did not return an authorization token");
  }
  const authToken = loginBody.authorization;

  // Step 3: re-discover controls with the auth token to find the
  // clientCredentials endpoint (which is only present when authenticated).
  const authedIndexRes = await fetch(`${issuer}.account/`, {
    headers: { authorization: `CSS-Account-Token ${authToken}` },
  });
  const authedIndex = (await authedIndexRes.json()) as {
    controls?: { account?: { clientCredentials?: string } };
  };
  const credsUrl = authedIndex?.controls?.account?.clientCredentials;
  if (!credsUrl) {
    throw new Error("No clientCredentials control after login");
  }

  // Step 4: mint client credentials. CSS requires the target WebID;
  // we use the canonical pod WebID derived from the issuer + pod name.
  const credsRes = await fetch(credsUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `CSS-Account-Token ${authToken}`,
    },
    body: JSON.stringify({
      name: `mind-chat-seed-${Date.now()}`,
      webId: opts.webId ?? deriveWebId(issuer, opts.email),
    }),
  });
  if (!credsRes.ok) {
    const text = await credsRes.text();
    throw new Error(`CSS credentials mint failed (${credsRes.status}): ${text}`);
  }
  const creds = (await credsRes.json()) as { id?: string; secret?: string };
  if (!creds.id || !creds.secret) {
    throw new Error("CSS credentials response missing id/secret");
  }

  // Step 5: use the credentials to obtain an authenticated Inrupt session.
  const session = new Session();
  await session.login({
    clientId: creds.id,
    clientSecret: creds.secret,
    oidcIssuer: issuer,
    tokenType: "DPoP",
  });
  if (!session.info.isLoggedIn) {
    throw new Error("Inrupt session did not log in after CSS credentials");
  }
  return session;
}

/**
 * The seeded user in our infra/css-{alice,bob}/seed.json provisions
 * a pod named alice/bob, so the WebID lives at <issuer><name>/profile/card#me.
 * For the demo seed we read the pod name from the email's local-part as a
 * stable default — every demo persona's email matches their pod name.
 */
export function deriveWebId(issuer: string, email: string): string {
  const local = email.split("@")[0] ?? "user";
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return `${base}${local}/profile/card#me`;
}

import type { AuthenticatedFetch } from "./chat";

/**
 * Write a WAC ACL granting the owner full Control and each member
 * Read+Append on the room container and all children. We write the ACL
 * resource directly (PUT to <container>.acl) because the universal-access
 * helpers in @inrupt/solid-client have historically been flaky on
 * containers across server implementations.
 *
 * In WAC, `acl:default` makes the auth apply to children; `acl:accessTo`
 * makes it apply to the resource itself. We use both so a member can read
 * the container AND the day files inside it.
 */
export async function writeRoomAcl(
  roomUrl: string,
  ownerWebid: string,
  memberWebids: readonly string[],
  fetch: AuthenticatedFetch,
): Promise<void> {
  const containerUrl = roomUrl.endsWith("/") ? roomUrl : `${roomUrl}/`;
  const aclUrl = `${containerUrl}.acl`;

  const members = memberWebids.map(
    (w, i) => `<#member${i}>
  a acl:Authorization;
  acl:agent <${w}>;
  acl:accessTo <./>;
  acl:default <./>;
  acl:mode acl:Read, acl:Append.`,
  );

  const ttl = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.

<#owner>
  a acl:Authorization;
  acl:agent <${ownerWebid}>;
  acl:accessTo <./>;
  acl:default <./>;
  acl:mode acl:Read, acl:Write, acl:Append, acl:Control.

${members.join("\n\n")}
`;

  const res = await fetch(aclUrl, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body: ttl,
  });
  if (!res.ok && res.status !== 205) {
    throw new Error(`ACL write failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Read the current member list from the room's WAC ACL. Excludes the room
 * owner. Returns [] if the .acl resource doesn't exist (room has default
 * inherited access only). Uses a permissive regex parser — fine for ACLs
 * we wrote ourselves; brittle against arbitrary ACL shapes.
 */
export async function listRoomMembers(
  roomUrl: string,
  ownerWebid: string,
  fetch: AuthenticatedFetch,
): Promise<string[]> {
  const containerUrl = roomUrl.endsWith("/") ? roomUrl : `${roomUrl}/`;
  const aclUrl = `${containerUrl}.acl`;
  const res = await fetch(aclUrl, { headers: { accept: "text/turtle" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ACL read failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const re = /acl:agent\s+<([^>]+)>/g;
  const agents = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] && m[1] !== ownerWebid) agents.add(m[1]);
  }
  return Array.from(agents);
}

/**
 * Idempotently add a member to the room ACL. Reads the current member list,
 * adds the new WebID if not already present, and rewrites the ACL.
 * Returns the updated member list.
 */
export async function addRoomMember(
  roomUrl: string,
  ownerWebid: string,
  newMemberWebid: string,
  fetch: AuthenticatedFetch,
): Promise<string[]> {
  if (!isLikelyWebid(newMemberWebid)) {
    throw new Error("Not a WebID URL (expected http(s)://…/profile/card#me or similar)");
  }
  const existing = await listRoomMembers(roomUrl, ownerWebid, fetch);
  if (existing.includes(newMemberWebid) || newMemberWebid === ownerWebid) {
    return existing;
  }
  const updated = [...existing, newMemberWebid];
  await writeRoomAcl(roomUrl, ownerWebid, updated, fetch);
  return updated;
}

/**
 * Remove a member from the room ACL. No-op if the WebID isn't a member.
 * The owner cannot be removed via this helper.
 */
export async function removeRoomMember(
  roomUrl: string,
  ownerWebid: string,
  memberWebid: string,
  fetch: AuthenticatedFetch,
): Promise<string[]> {
  const existing = await listRoomMembers(roomUrl, ownerWebid, fetch);
  const updated = existing.filter((w) => w !== memberWebid);
  if (updated.length === existing.length) return existing;
  await writeRoomAcl(roomUrl, ownerWebid, updated, fetch);
  return updated;
}

function isLikelyWebid(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}


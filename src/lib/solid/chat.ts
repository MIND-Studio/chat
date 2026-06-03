import {
  buildThing,
  createSolidDataset,
  createThing,
  getDatetime,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  removeThing,
  saveSolidDatasetAt,
  setThing,
  asUrl,
} from "@inrupt/solid-client";
import { ulid } from "@/lib/util/ulid";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const MEETING_LONG_CHAT = "http://www.w3.org/ns/pim/meeting#LongChat";
const MEETING_MESSAGE = "http://www.w3.org/ns/pim/meeting#message";
const SIOC_CONTENT = "http://rdfs.org/sioc/ns#content";
const FOAF_MAKER = "http://xmlns.com/foaf/0.1/maker";
const DCT_CREATED = "http://purl.org/dc/terms/created";
const DCT_TITLE = "http://purl.org/dc/terms/title";
const DCT_CREATOR = "http://purl.org/dc/terms/creator";
const DCT_IS_REPLACED_BY = "http://purl.org/dc/terms/isReplacedBy";
const SCHEMA_DATE_DELETED = "http://schema.org/dateDeleted";
const SCHEMA_LIKE_ACTION = "http://schema.org/LikeAction";
const SCHEMA_AGENT = "http://schema.org/agent";
const SCHEMA_TARGET = "http://schema.org/target";
const SCHEMA_NAME = "http://schema.org/name";
const SCHEMA_DATE_CREATED = "http://schema.org/dateCreated";

export const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "🙏", "🚀"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export type ReactionAgg = {
  emoji: string;
  reactors: string[]; // WebIDs
  /** URL of the current user's reaction resource, if they've reacted. */
  myReactionUrl?: string;
};

export type ChatMessage = {
  /** Stable identity = the channel's original message resource URL. */
  url: string;
  body: string;
  author: string;
  createdAtIso: string;
  /** Set if this message has been edited (timestamp of latest revision). */
  editedAtIso?: string;
  /** Set if the author has soft-deleted the message. */
  deletedAtIso?: string;
  /** Aggregated reactions by emoji. */
  reactions: ReactionAgg[];
};

export type RoomMeta = {
  url: string;
  title: string;
  creator: string;
  createdAtIso: string;
};

export type AuthenticatedFetch = typeof globalThis.fetch;

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function utcParts(d: Date): { y: string; m: string; day: string } {
  return {
    y: String(d.getUTCFullYear()),
    m: String(d.getUTCMonth() + 1).padStart(2, "0"),
    day: String(d.getUTCDate()).padStart(2, "0"),
  };
}

export function dayContainerUrl(roomUrl: string, d: Date = new Date()): string {
  const { y, m, day } = utcParts(d);
  return `${trimSlash(roomUrl)}/${y}/${m}/${day}/`;
}

export function dayFileUrl(roomUrl: string, d: Date = new Date()): string {
  return `${dayContainerUrl(roomUrl, d)}chat.ttl`;
}

export function roomIndexUrl(roomUrl: string): string {
  return `${trimSlash(roomUrl)}/index.ttl`;
}

/**
 * Idempotently create the room index document declaring the long-chat
 * channel. Safe to call on every page load.
 */
export async function ensureRoom(
  roomUrl: string,
  title: string,
  creatorWebid: string,
  fetch: AuthenticatedFetch,
): Promise<void> {
  const indexUrl = roomIndexUrl(roomUrl);
  try {
    await getSolidDataset(indexUrl, { fetch });
    return;
  } catch {
    // Doesn't exist yet — create it below.
  }
  const subject = `${indexUrl}#this`;
  const thing = buildThing(createThing({ url: subject }))
    .addUrl(RDF_TYPE, MEETING_LONG_CHAT)
    .addStringNoLocale(DCT_TITLE, title)
    .addUrl(DCT_CREATOR, creatorWebid)
    .addDatetime(DCT_CREATED, new Date())
    .build();
  const dataset = setThing(createSolidDataset(), thing);
  await saveSolidDatasetAt(indexUrl, dataset, { fetch });
}

/**
 * Idempotently create today's day file as an empty long-chat document.
 * Required before subscribing to it via WebSocketChannel2023, since CSS
 * 404s notification subscriptions on nonexistent resources.
 */
export async function ensureTodayFile(
  roomUrl: string,
  fetch: AuthenticatedFetch,
): Promise<string> {
  const dayUrl = dayFileUrl(roomUrl);
  try {
    await getSolidDataset(dayUrl, { fetch });
    return dayUrl;
  } catch {
    // Create empty channel doc for today.
  }
  const subject = `${dayUrl}#this`;
  const thing = buildThing(createThing({ url: subject }))
    .addUrl(RDF_TYPE, MEETING_LONG_CHAT)
    .build();
  const dataset = setThing(createSolidDataset(), thing);
  await saveSolidDatasetAt(dayUrl, dataset, { fetch });
  return dayUrl;
}

/**
 * Append a message to today's chat.ttl using SolidOS long-chat vocabulary.
 * Uses getSolidDataset + setThing + saveSolidDatasetAt rather than raw
 * SPARQL PATCH — less network-efficient but simpler and reliable across
 * server implementations.
 */
export async function postMessage(
  roomUrl: string,
  body: string,
  authorWebid: string,
  fetch: AuthenticatedFetch,
): Promise<ChatMessage> {
  const dayUrl = await ensureTodayFile(roomUrl, fetch);
  let dataset = await getSolidDataset(dayUrl, { fetch });

  const id = ulid();
  const msgSubject = `${dayUrl}#msg-${id}`;
  const createdAt = new Date();

  const channelSubject = `${dayUrl}#this`;
  const existingChannel = getThing(dataset, channelSubject);
  const channelBuilder = existingChannel
    ? buildThing(existingChannel)
    : buildThing(createThing({ url: channelSubject })).addUrl(RDF_TYPE, MEETING_LONG_CHAT);
  dataset = setThing(dataset, channelBuilder.addUrl(MEETING_MESSAGE, msgSubject).build());

  const messageThing = buildThing(createThing({ url: msgSubject }))
    .addStringNoLocale(SIOC_CONTENT, body)
    .addUrl(FOAF_MAKER, authorWebid)
    .addDatetime(DCT_CREATED, createdAt)
    .build();
  dataset = setThing(dataset, messageThing);

  await saveSolidDatasetAt(dayUrl, dataset, { fetch });

  return {
    url: msgSubject,
    body,
    author: authorWebid,
    createdAtIso: createdAt.toISOString(),
    reactions: [],
  };
}

/**
 * Read all messages from today's chat.ttl, sorted by original created_at
 * ascending. Walks `dct:isReplacedBy` chains so each chain returns only
 * one ChatMessage: keyed by the chain head (original message URL) with
 * the body + editedAtIso of the chain's tail (latest revision).
 *
 * Returns [] if the file doesn't exist.
 */
export async function listTodayMessages(
  roomUrl: string,
  fetch: AuthenticatedFetch,
  selfWebid?: string | null,
): Promise<ChatMessage[]> {
  const dayUrl = dayFileUrl(roomUrl);
  try {
    const dataset = await getSolidDataset(dayUrl, { fetch });
    type Raw = {
      url: string;
      body: string;
      author: string;
      createdAt: Date;
      nextUrl?: string;
      deletedAt?: Date;
    };
    const byUrl = new Map<string, Raw>();
    // Collect reactions in a first pass so we can attach them to their target msg.
    type ReactionRaw = {
      url: string;
      target: string;
      agent: string;
      emoji: string;
    };
    const reactionsByTarget = new Map<string, ReactionRaw[]>();

    for (const t of getThingAll(dataset)) {
      // Reaction?
      const types = (t as { predicates?: Record<string, unknown> }).predicates;
      const typeUrl = getUrl(t, RDF_TYPE);
      if (typeUrl === SCHEMA_LIKE_ACTION) {
        const target = getUrl(t, SCHEMA_TARGET);
        const agent = getUrl(t, SCHEMA_AGENT);
        const emoji = getStringNoLocale(t, SCHEMA_NAME);
        if (target && agent && emoji) {
          const list = reactionsByTarget.get(target) ?? [];
          list.push({ url: asUrl(t), target, agent, emoji });
          reactionsByTarget.set(target, list);
        }
        continue;
      }
      void types;
      const body = getStringNoLocale(t, SIOC_CONTENT);
      const author = getUrl(t, FOAF_MAKER);
      const createdAt = getDatetime(t, DCT_CREATED);
      if (!body || !author || !createdAt) continue;
      const nextUrl = getUrl(t, DCT_IS_REPLACED_BY) ?? undefined;
      const deletedAt = getDatetime(t, SCHEMA_DATE_DELETED) ?? undefined;
      byUrl.set(t.url, { url: t.url, body, author, createdAt, nextUrl, deletedAt });
    }
    // A node is a "tail" target if some other node's nextUrl points at it.
    const referenced = new Set<string>();
    for (const r of byUrl.values()) {
      if (r.nextUrl) referenced.add(r.nextUrl);
    }
    const out: ChatMessage[] = [];
    for (const head of byUrl.values()) {
      if (referenced.has(head.url)) continue; // not a head — it's a replacement target
      // Walk to tail.
      let tail = head;
      const visited = new Set<string>([head.url]);
      while (tail.nextUrl && byUrl.has(tail.nextUrl) && !visited.has(tail.nextUrl)) {
        visited.add(tail.nextUrl);
        tail = byUrl.get(tail.nextUrl)!;
      }
      const rawReactions = reactionsByTarget.get(head.url) ?? [];
      const grouped = new Map<string, ReactionAgg>();
      for (const r of rawReactions) {
        const agg = grouped.get(r.emoji) ?? { emoji: r.emoji, reactors: [] };
        if (!agg.reactors.includes(r.agent)) agg.reactors.push(r.agent);
        if (selfWebid && r.agent === selfWebid) agg.myReactionUrl = r.url;
        grouped.set(r.emoji, agg);
      }
      const reactions = Array.from(grouped.values()).sort(
        (a, b) => b.reactors.length - a.reactors.length || a.emoji.localeCompare(b.emoji),
      );
      out.push({
        url: head.url,
        body: tail.body,
        author: head.author,
        createdAtIso: head.createdAt.toISOString(),
        editedAtIso: tail.url === head.url ? undefined : tail.createdAt.toISOString(),
        deletedAtIso: head.deletedAt?.toISOString(),
        reactions,
      });
    }
    out.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
    return out;
  } catch {
    return [];
  }
}

/**
 * Edit a previously-posted message by writing a new message resource and
 * linking the original to it via `dct:isReplacedBy`. This is the long-chat
 * spec's edit pattern — preserves history (the original body remains
 * readable in the .ttl) and lets clients render either the latest or the
 * full chain. Only the original author should call this (UI-enforced).
 */
/**
 * Soft-delete a message by adding `schema:dateDeleted` to the chain head.
 * The original body and all revisions remain in the .ttl for historical
 * record (in line with the long-chat spec's "preserve history" stance);
 * the UI renders a tombstone.
 */
export async function deleteMessage(
  roomUrl: string,
  messageUrl: string,
  fetch: AuthenticatedFetch,
): Promise<void> {
  const dayUrl = dayFileUrl(roomUrl);
  let dataset = await getSolidDataset(dayUrl, { fetch });
  const head = getThing(dataset, messageUrl);
  if (!head) throw new Error(`message not found: ${messageUrl}`);
  dataset = setThing(
    dataset,
    buildThing(head).addDatetime(SCHEMA_DATE_DELETED, new Date()).build(),
  );
  await saveSolidDatasetAt(dayUrl, dataset, { fetch });
}

/**
 * Toggle a reaction on a message. If the user already has a reaction with
 * the same emoji on the message, it's removed; otherwise added. Storage:
 * one `schema:LikeAction` thing per reaction with schema:name = emoji.
 * Resource lives in the same day file as the target message.
 */
export async function toggleReaction(
  messageUrl: string,
  emoji: string,
  reactorWebid: string,
  fetch: AuthenticatedFetch,
): Promise<void> {
  // The message URL contains a fragment; the day file URL is what precedes it.
  const hashIdx = messageUrl.indexOf("#");
  if (hashIdx < 0) throw new Error("invalid message URL (no fragment)");
  const dayUrl = messageUrl.slice(0, hashIdx);
  let dataset = await getSolidDataset(dayUrl, { fetch });

  // Find an existing reaction by this reactor for this emoji on this msg.
  let existing: ReturnType<typeof getThing> | null = null;
  for (const t of getThingAll(dataset)) {
    if (getUrl(t, RDF_TYPE) !== SCHEMA_LIKE_ACTION) continue;
    if (getUrl(t, SCHEMA_TARGET) !== messageUrl) continue;
    if (getUrl(t, SCHEMA_AGENT) !== reactorWebid) continue;
    if (getStringNoLocale(t, SCHEMA_NAME) !== emoji) continue;
    existing = t;
    break;
  }

  if (existing) {
    dataset = removeThing(dataset, existing);
    await saveSolidDatasetAt(dayUrl, dataset, { fetch });
    return;
  }

  const id = ulid();
  const subject = `${dayUrl}#react-${id}`;
  const thing = buildThing(createThing({ url: subject }))
    .addUrl(RDF_TYPE, SCHEMA_LIKE_ACTION)
    .addUrl(SCHEMA_TARGET, messageUrl)
    .addUrl(SCHEMA_AGENT, reactorWebid)
    .addStringNoLocale(SCHEMA_NAME, emoji)
    .addDatetime(SCHEMA_DATE_CREATED, new Date())
    .build();
  dataset = setThing(dataset, thing);
  await saveSolidDatasetAt(dayUrl, dataset, { fetch });
}

export async function editMessage(
  roomUrl: string,
  originalMessageUrl: string,
  newBody: string,
  authorWebid: string,
  fetch: AuthenticatedFetch,
): Promise<ChatMessage> {
  const dayUrl = dayFileUrl(roomUrl);
  let dataset = await getSolidDataset(dayUrl, { fetch });

  const original = getThing(dataset, originalMessageUrl);
  if (!original) {
    throw new Error(`original message not found in today's file: ${originalMessageUrl}`);
  }
  // Follow any existing chain to its tail; we link the *tail* to the new
  // revision so chains stay flat and walkable in one direction.
  let tailSubject = originalMessageUrl;
  for (let i = 0; i < 100; i++) {
    const tThing = getThing(dataset, tailSubject);
    if (!tThing) break;
    const next = getUrl(tThing, DCT_IS_REPLACED_BY);
    if (!next || next === tailSubject) break;
    tailSubject = next;
  }

  const id = ulid();
  const newSubject = `${dayUrl}#msg-${id}`;
  const createdAt = new Date();

  // Add the new message thing.
  const newThing = buildThing(createThing({ url: newSubject }))
    .addStringNoLocale(SIOC_CONTENT, newBody)
    .addUrl(FOAF_MAKER, authorWebid)
    .addDatetime(DCT_CREATED, createdAt)
    .build();
  dataset = setThing(dataset, newThing);

  // Link the current tail to the new revision.
  const tailThing = getThing(dataset, tailSubject);
  if (tailThing) {
    dataset = setThing(
      dataset,
      buildThing(tailThing).addUrl(DCT_IS_REPLACED_BY, newSubject).build(),
    );
  }

  await saveSolidDatasetAt(dayUrl, dataset, { fetch });

  // Read the original's created timestamp for return value.
  const origCreated =
    getDatetime(original, DCT_CREATED) ?? createdAt;

  return {
    url: originalMessageUrl,
    body: newBody,
    author: authorWebid,
    createdAtIso: origCreated.toISOString(),
    editedAtIso: createdAt.toISOString(),
    reactions: [],
  };
}

export async function readRoomMeta(
  roomUrl: string,
  fetch: AuthenticatedFetch,
): Promise<RoomMeta | null> {
  try {
    const indexUrl = roomIndexUrl(roomUrl);
    const dataset = await getSolidDataset(indexUrl, { fetch });
    const t = getThing(dataset, `${indexUrl}#this`);
    if (!t) return null;
    const title = getStringNoLocale(t, DCT_TITLE) ?? "(untitled room)";
    const creator = getUrl(t, DCT_CREATOR) ?? "";
    const createdAt = getDatetime(t, DCT_CREATED);
    return {
      url: roomUrl,
      title,
      creator,
      createdAtIso: createdAt?.toISOString() ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

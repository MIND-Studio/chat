# Join the mind-chat room as an AI agent

You are an AI agent joining a live Solid-pod-backed chat room. Your task is to (1) provision yourself an identity on the chat host's Solid server, (2) wait for the human (testuser) to grant you access to the room, then (3) participate in the conversation — read incoming messages and post replies.

## Context

- **mind-chat** is a privacy-first chat prototype where every message is stored as RDF on a Solid pod, not in a central database. Real-time delivery uses Solid's WebSocketChannel2023 notifications protocol.
- The chat host is **Community Solid Server v7** running at `https://pods.mindpods.org/`. CORS is wide open; account signup is enabled.
- The active chat room lives at `https://pods.mindpods.org/testuser/chat/general/`. Today's messages are in `chat/general/<UTC-YYYY>/<MM>/<DD>/chat.ttl`.
- The room is private (WAC ACL). testuser is the owner; you'll need them to grant you read+append.
- The wire format for messages is the **SolidOS long-chat spec** (see https://solid.github.io/chat/). Each message is a triple set with predicates `sioc:content` (body), `foaf:maker` (author WebID), `dct:created` (UTC timestamp), linked from a `meeting:LongChat` channel via `meeting:message`.

## Step 1 — Provision yourself an account + pod

Pick a unique pod name. Suggestion: `claude-<short-id>`. Use any email + a strong password (these are local to the demo deployment).

```bash
HOST=https://pods.mindpods.org
EMAIL=claude-AGENT@mind-chat.local        # replace AGENT with your chosen suffix
PASSWORD=$(openssl rand -hex 16)
POD_NAME=claude-AGENT                      # match EMAIL local-part

# 1. Create an empty account, get an auth token.
RESP=$(curl -s -X POST $HOST/.account/account/ -H "content-type: application/json" -d '{}')
AUTH=$(echo "$RESP" | jq -r .authorization)
PW_URL=$(echo "$RESP" | jq -r '.controls.password.create // empty')

# The 'password.create' control only appears AFTER authenticating, so refetch.
CTRLS=$(curl -s $HOST/.account/ -H "authorization: CSS-Account-Token $AUTH")
PW_URL=$(echo "$CTRLS" | jq -r '.controls.password.create')
POD_URL=$(echo "$CTRLS" | jq -r '.controls.account.pod')

# 2. Add password login.
curl -s -X POST "$PW_URL" \
  -H "authorization: CSS-Account-Token $AUTH" \
  -H "content-type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

# 3. Create your pod. Returns your WebID.
POD_RESP=$(curl -s -X POST "$POD_URL" \
  -H "authorization: CSS-Account-Token $AUTH" \
  -H "content-type: application/json" \
  -d "{\"name\":\"$POD_NAME\"}")
MY_WEBID=$(echo "$POD_RESP" | jq -r .webId)
echo "MY_WEBID=$MY_WEBID"
echo "save this for later — and announce it to testuser so they can invite you."
```

## Step 2 — Get yourself invited

Announce your WebID to the human running the room (the URL printed above). They will paste it into the room's "invite by webid" panel; their Next.js client will update the WAC ACL on `https://pods.mindpods.org/testuser/chat/general/.acl` to grant your WebID `acl:Read` + `acl:Append`.

If you can speak to them via another channel (CLI prompt, another chat, screen-share), say something like:

> *Invite me to the chat. My WebID is `<MY_WEBID>`.*

You can verify access by doing an authenticated GET on the room. Until invited, you'll get 403.

## Step 3 — Mint client credentials for your agent

Solid-OIDC client-credentials flow gives you a long-lived ID+secret that you can use to obtain DPoP-bound access tokens.

```bash
CRED_URL=$(echo "$CTRLS" | jq -r '.controls.account.clientCredentials')
CRED_RESP=$(curl -s -X POST "$CRED_URL" \
  -H "authorization: CSS-Account-Token $AUTH" \
  -H "content-type: application/json" \
  -d "{\"name\":\"chat-agent\",\"webId\":\"$MY_WEBID\"}")
CLIENT_ID=$(echo "$CRED_RESP" | jq -r .id)
CLIENT_SECRET=$(echo "$CRED_RESP" | jq -r .secret)
echo "CLIENT_ID=$CLIENT_ID"
echo "CLIENT_SECRET=$CLIENT_SECRET   # SECRET — keep it"
```

From a Node.js process, use `@inrupt/solid-client-authn-node`:

```js
import { Session } from "@inrupt/solid-client-authn-node";
const session = new Session();
await session.login({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  oidcIssuer: "https://pods.mindpods.org/",
  tokenType: "DPoP",
});
const fetch = session.fetch;  // pre-signs every request with DPoP + bearer
```

## Step 4 — Subscribe to the room via WebSocketChannel2023

```js
const ROOM = "https://pods.mindpods.org/testuser/chat/general";
const today = new Date();
const y = today.getUTCFullYear();
const m = String(today.getUTCMonth() + 1).padStart(2, "0");
const d = String(today.getUTCDate()).padStart(2, "0");
const dayUrl = `${ROOM}/${y}/${m}/${d}/chat.ttl`;

// Subscribe — single POST returns a receiveFrom WebSocket URL.
const subRes = await fetch("https://pods.mindpods.org/.notifications/WebSocketChannel2023/", {
  method: "POST",
  headers: { "content-type": "application/ld+json" },
  body: JSON.stringify({
    "@context": ["https://www.w3.org/ns/solid/notification/v1"],
    type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
    topic: dayUrl,
  }),
});
const { receiveFrom } = await subRes.json();

const ws = new WebSocket(receiveFrom);
ws.addEventListener("message", async () => {
  // Notification body is metadata — re-GET the day file for actual content.
  const text = await (await fetch(dayUrl, { headers: { accept: "text/turtle" } })).text();
  // Parse triples; emit new ones to your reasoning step.
});
```

## Step 5 — Read messages from today's chat.ttl

GET `https://pods.mindpods.org/testuser/chat/general/<YYYY>/<MM>/<DD>/chat.ttl` and parse the Turtle. Each message resource has the shape:

```turtle
@prefix sioc:    <http://rdfs.org/sioc/ns#> .
@prefix foaf:    <http://xmlns.com/foaf/0.1/> .
@prefix dct:     <http://purl.org/dc/terms/> .
@prefix meeting: <http://www.w3.org/ns/pim/meeting#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .

<#this> a meeting:LongChat ;
  meeting:message <#msg-XXXX>, <#msg-YYYY>, … .

<#msg-XXXX>
  sioc:content "Hey there" ;
  foaf:maker <https://pods.mindpods.org/testuser/profile/card#me> ;
  dct:created "2026-05-26T22:00:00Z"^^xsd:dateTime .
```

A simple regex extractor is fine for v0; a real RDF parser like `n3` or `@inrupt/solid-client` is better.

Track which `#msg-…` ids you've already seen so you only react to new ones. Filter out messages where `foaf:maker == MY_WEBID` so you don't loop on your own output.

## Step 6 — Post a message

Read today's `chat.ttl`, build the updated graph with a new `<#msg-…>` resource, then PATCH (SPARQL INSERT) or PUT back the document. Easiest is the Inrupt client's `getSolidDataset` + `setThing` + `saveSolidDatasetAt` flow — copy the pattern from `src/lib/solid/chat.ts` in the host repo if you have access to it.

A message resource needs three triples — `sioc:content` (string), `foaf:maker` (your WebID URL), `dct:created` (ISO datetime). Make sure to also append `meeting:message <#msg-id>` to the `<#this>` channel.

If today's `chat.ttl` doesn't exist yet, PUT an empty `<#this> a meeting:LongChat .` first.

## Loop

```
1. WebSocket message arrives  →  re-GET chat.ttl  →  list new triples
2. For each new message not from you:
     a. Decide whether to respond (don't respond to every line; be a calm participant)
     b. Compose a reply (be concise, match the room's tone)
     c. PATCH chat.ttl with your message resource
3. Sleep, wait for next ws event
```

## Etiquette

- One message at a time. The room is small (3–5 people max). Don't flood.
- Announce yourself when you join: who you are, what model, who invited you. *Don't* just start talking.
- If you have nothing useful to add, say nothing.
- If a message asks you a question by name, answer.
- If the room goes quiet for a few minutes, don't manufacture filler.
- Don't echo or paraphrase prior messages.

## Troubleshooting

- **403 on the day file** — testuser hasn't invited you yet, or the ACL is wrong. Wait, or ping them.
- **401 on the subscription POST** — your DPoP token expired or the OIDC session lapsed; re-login via `session.login` with the client credentials.
- **No WS notifications** — Community Solid Server expires subscriptions after 2 weeks; in long-running deployments, re-subscribe periodically. For short sessions you don't need to. Also keep a polling backstop (re-GET the day file every 10 s) in case the socket drops.
- **UTC date rollover** — at UTC midnight today's file changes path (`/YYYY/MM/(DD+1)/chat.ttl`). Resubscribe to the new day's URL.

That's it. Welcome to the room.

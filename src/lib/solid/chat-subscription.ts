"use client";

import { dayFileUrl, ensureTodayFile, type AuthenticatedFetch } from "./chat";
import { log } from "@/lib/util/log";

export type SubscriptionState = "connecting" | "connected" | "polling" | "error";

export type SubscriptionHandle = {
  disconnect: () => void;
};

const POLL_INTERVAL_MS = 2_000;

/**
 * Compute the WebSocketChannel2023 subscription endpoint for a given
 * topic URL by reading the pod's storage description document. CSS v7
 * exposes the endpoint via `solid:subscription` predicate; we follow
 * that pointer rather than relying on the @inrupt/solid-client-notifications
 * SDK, whose discovery walk expects an older `solid:notificationGateway`
 * predicate that current CSS doesn't expose.
 */
async function discoverSubscriptionEndpoint(
  topicUrl: string,
  fetch: AuthenticatedFetch,
): Promise<string> {
  // Heuristic shortcut: subscription endpoint lives at the origin's
  // /.notifications/WebSocketChannel2023/. CSS uniformly exposes it there.
  // We still fetch the storage description to confirm and to be robust
  // against multi-tenant deployments where it could move.
  const fallback = `${new URL(topicUrl).origin}/.notifications/WebSocketChannel2023/`;
  try {
    const head = await fetch(topicUrl, { method: "HEAD" });
    const link = head.headers.get("link") ?? "";
    const storageDescMatch = link.match(
      /<([^>]+)>\s*;\s*rel="http:\/\/www\.w3\.org\/ns\/solid\/terms#storageDescription"/,
    );
    if (!storageDescMatch?.[1]) return fallback;
    const descUrl = storageDescMatch[1];
    const descRes = await fetch(descUrl, {
      headers: { accept: "application/ld+json" },
    });
    if (!descRes.ok) return fallback;
    const desc = (await descRes.json()) as Array<Record<string, unknown>>;
    for (const node of desc) {
      const channelType = (node[
        "http://www.w3.org/ns/solid/notifications#channelType"
      ] ?? []) as Array<{ "@id"?: string }>;
      if (
        channelType.some(
          (c) =>
            c["@id"] ===
            "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
        )
      ) {
        const id = node["@id"];
        if (typeof id === "string") return id;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Subscribe to a topic resource via WebSocketChannel2023. Posts a JSON-LD
 * subscription request with the user's authenticated (DPoP-bound) fetch;
 * the response contains `receiveFrom` (a wss:// URL); we open that
 * WebSocket and fire `onMessage` on every notification frame.
 */
async function openSubscription(
  topicUrl: string,
  fetch: AuthenticatedFetch,
  onMessage: () => void,
  onClose: () => void,
): Promise<{ close: () => void }> {
  const subscribeUrl = await discoverSubscriptionEndpoint(topicUrl, fetch);

  const subRes = await fetch(subscribeUrl, {
    method: "POST",
    headers: { "content-type": "application/ld+json" },
    body: JSON.stringify({
      "@context": ["https://www.w3.org/ns/solid/notification/v1"],
      type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
      topic: topicUrl,
    }),
  });
  if (!subRes.ok) {
    const body = await subRes.text();
    throw new Error(`subscription POST failed (${subRes.status}): ${body.slice(0, 200)}`);
  }
  const subBody = (await subRes.json()) as { receiveFrom?: string };
  if (!subBody.receiveFrom) {
    throw new Error("subscription response missing receiveFrom");
  }

  const ws = new WebSocket(subBody.receiveFrom);
  ws.addEventListener("message", () => onMessage());
  ws.addEventListener("close", () => onClose());
  ws.addEventListener("error", () => onClose());

  return {
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Subscribe to today's chat.ttl. On any change (Update from PATCH/PUT, or
 * Add from a sibling resource being created), fire `onChange`. The caller
 * re-fetches and re-renders.
 *
 * Falls back to 2-second polling if the WebSocket cannot be established
 * or drops. Polling is honest prior-art: every previous Solid chat shipped
 * with it as the fallback path.
 */
export async function subscribeToRoom(
  roomUrl: string,
  fetch: AuthenticatedFetch,
  onChange: () => void,
  onState?: (s: SubscriptionState) => void,
): Promise<SubscriptionHandle> {
  await ensureTodayFile(roomUrl, fetch);
  const topicUrl = dayFileUrl(roomUrl);
  onState?.("connecting");

  let subscription: { close: () => void } | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function startPolling() {
    if (pollTimer || disposed) return;
    log.info(
      { event: "chat.subscription.fallback", host: hostOf(topicUrl) },
      "polling fallback engaged",
    );
    onState?.("polling");
    pollTimer = setInterval(onChange, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  try {
    subscription = await openSubscription(
      topicUrl,
      fetch,
      () => onChange(),
      () => {
        if (!disposed) startPolling();
      },
    );
    log.info({ event: "chat.subscription.connected", host: hostOf(topicUrl) }, "ws connected");
    onState?.("connected");
    // Refresh once after connect to catch any message that was written
    // between the initial list and the subscription handshake completing.
    // This avoids a race where a sender posts before the receiver's WS is open.
    onChange();
  } catch (err) {
    log.warn(
      { event: "chat.subscription.connect-failed", host: hostOf(topicUrl), err: String(err) },
      "ws connect failed",
    );
    onState?.("error");
    startPolling();
  }

  return {
    disconnect() {
      disposed = true;
      subscription?.close();
      stopPolling();
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

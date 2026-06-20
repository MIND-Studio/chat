export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-4">
      <h1 className="text-3xl font-semibold">about chat</h1>
      <p>
        This is a prototype. Two users (alice on port 3031, bob on port 3032) each have a Solid pod
        backed by Community Solid Server v7. The chat room <code>chat/general/</code> lives on
        alice&apos;s pod with an ACL granting bob read+append.
      </p>
      <h2 className="text-lg font-medium pt-4">What lives where</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>
          <strong>On alice&apos;s pod:</strong> the room descriptor (
          <code>chat/general/index.ttl</code>), the WAC ACL (<code>chat/general/.acl</code>), and
          per-day message files (<code>chat/general/YYYY/MM/DD/chat.ttl</code>) in the{" "}
          <a
            className="underline"
            href="https://solid.github.io/chat/"
            target="_blank"
            rel="noreferrer"
          >
            SolidOS long-chat layout
          </a>
          .
        </li>
        <li>
          <strong>On bob&apos;s pod:</strong> his profile and inbox. Bob owns no rooms in this demo
          — he&apos;s a member of alice&apos;s room via her ACL.
        </li>
        <li>
          <strong>On the chat app&apos;s server:</strong> nothing. No message store, no membership
          table, no analytics.
        </li>
      </ul>
      <h2 className="text-lg font-medium pt-4">How real-time works</h2>
      <p>
        Each connected client subscribes to today&apos;s chat file via{" "}
        <a
          className="underline"
          href="https://solid.github.io/notifications/websocket-channel-2023"
          target="_blank"
          rel="noreferrer"
        >
          WebSocketChannel2023
        </a>
        . On every PATCH the resource emits an update notification; the client re-GETs and renders.
        If the WebSocket fails, the UI falls back to 2-second polling.
      </p>
      <h2 className="text-lg font-medium pt-4">Deferred to v1</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>End-to-end encryption (X25519 + libsodium sealed-box)</li>
        <li>Cross-server federation (UMA tokens, foreign-pod inbox grants)</li>
        <li>Presence, typing indicators, read receipts</li>
        <li>Threading / replies (the data model supports it; the UI doesn&apos;t yet)</li>
        <li>Image uploads</li>
        <li>An indexer with a public-rooms directory</li>
      </ul>
    </main>
  );
}

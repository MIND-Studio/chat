"use client";

import { MindLoginCard, writeLastIdentity } from "@mind-studio/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { oidcIssuer } from "@/lib/config";
import { useSession } from "@/lib/solid/session";

const APP_NAME = "Chat";

export default function HomePage() {
  const { webid, loggedIn, loading, signIn } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && loggedIn && webid) {
      writeLastIdentity(APP_NAME, {
        webId: webid,
        displayName: webid.split("/").filter(Boolean).pop(),
      });
      router.replace("/chat");
    }
  }, [loading, loggedIn, webid, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16">
      <div className="mb-6 flex justify-end">
        <ThemeToggle />
      </div>
      <header className="mb-12">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--glass)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--cyan)] backdrop-blur-md">
          <span className="inline-block size-1.5 rounded-full bg-[color:var(--cyan)] shadow-[0_0_8px_var(--cyan-glow)]" />
          solid · ws2023 · long-chat
        </div>
        <h1 className="text-5xl font-semibold tracking-tight">
          mind<span className="text-[color:var(--cyan)]">/</span>chat
        </h1>
        <p className="mt-4 max-w-xl text-base text-[color:var(--text-muted)]">
          Messages live in your pod. Real-time delivery via WebSocketChannel2023. No chat server.
        </p>
      </header>

      <MindLoginCard
        appName={APP_NAME}
        defaultIssuer={oidcIssuer}
        onLogin={async ({ issuer }) => {
          await signIn(issuer);
        }}
      />

      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        {loading
          ? "// restoring session…"
          : loggedIn && webid
            ? `// signed in as ${webid} — redirecting`
            : "// CSS handles the credentials prompt"}
      </p>

      <section aria-label="What this prototype is" className="mt-12 grid gap-3 sm:grid-cols-3">
        <FactCard
          tag="storage"
          body="SolidOS long-chat layout. One UTC-dated .ttl per day. Free interop with SolidOS chat-pane."
        />
        <FactCard
          tag="transport"
          body="WebSocketChannel2023 push notifications, with 2s polling as fallback. Sub-100ms on a fast pod."
        />
        <FactCard
          tag="server"
          body="Just a static Next.js client. No central message store. ACL on the room container is the only auth."
        />
      </section>

      <footer className="mt-10 font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        <Link
          href="/about"
          className="underline-offset-2 hover:text-[color:var(--cyan)] hover:underline"
        >
          → what does this app store?
        </Link>
      </footer>
    </main>
  );
}

function FactCard({ tag, body }: { tag: string; body: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--glass)] p-4 backdrop-blur-md">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-[color:var(--cyan)]">
        // {tag}
      </div>
      <div className="text-[13px] leading-snug text-[color:var(--text)]">{body}</div>
    </div>
  );
}

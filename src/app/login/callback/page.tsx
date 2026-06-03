"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { handleIncomingRedirect } from "@inrupt/solid-client-authn-browser";

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await handleIncomingRedirect({ restorePreviousSession: false });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("OIDC callback failed", err);
      }
      if (!cancelled) {
        router.replace("/chat");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-[color:var(--text-muted)]">
      Finishing sign-in…
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getDefaultSession,
  handleIncomingRedirect,
  login,
  logout,
  type Session,
} from "@inrupt/solid-client-authn-browser";

const APP_NAME = "Mind Chat";

/**
 * Client-side Inrupt session hook. Restores session via
 * `handleIncomingRedirect({ restorePreviousSession: true })` on mount and
 * exposes the current WebID + login/logout actions.
 */
export function useSession(): {
  webid: string | null;
  loggedIn: boolean;
  loading: boolean;
  fetch: typeof globalThis.fetch | null;
  signIn: (issuer: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await handleIncomingRedirect({ restorePreviousSession: true });
      } catch {
        // Restore failed — proceed as signed-out.
      }
      if (!cancelled) {
        setSession(getDefaultSession());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(issuer: string) {
    await login({
      oidcIssuer: issuer,
      redirectUrl:
        typeof window !== "undefined" ? `${window.location.origin}/login/callback` : "",
      clientName: APP_NAME,
    });
  }

  async function signOut() {
    await logout();
    // `getDefaultSession()` returns the same singleton instance every call, so
    // re-setting it here is a no-op for React (Object.is) — the component never
    // re-renders and consumers never see the signed-out state. Set `null` (a
    // real reference change) so `loggedIn` flips and the chat page redirects.
    setSession(null);
  }

  return {
    webid: session?.info?.webId ?? null,
    loggedIn: !!session?.info?.isLoggedIn,
    loading,
    fetch: session?.fetch ?? null,
    signIn,
    signOut,
  };
}

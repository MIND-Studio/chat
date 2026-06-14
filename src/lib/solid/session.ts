"use client";

import {
  useStandaloneSession,
  type UseStandaloneSessionResult,
} from "@mind-studio/core/solid";

/**
 * Thin wrapper over the shared provider-free session hook from
 * `@mind-studio/core/solid`. Chat runs standalone only (no shell broker) and
 * routes deep links via the `mind:returnTo` capture, so it opts into
 * `rememberReturnTo`.
 */
export function useSession(): UseStandaloneSessionResult {
  return useStandaloneSession({ clientName: "Mind Chat", rememberReturnTo: true });
}

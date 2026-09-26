"use client";

import { useEffect } from "react";

/**
 * Development-only host guard. Auth.js stores the OAuth PKCE verifier in a
 * host-bound cookie when Google sign-in starts and reads it back on return —
 * if the user opens the app once as `localhost` and once as `127.0.0.1`, the
 * cookie is gone on return and Google login fails. Forcing one spelling keeps
 * the whole sign-in round-trip on a single host. No-op in production.
 */
export function DevHostGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const { hostname, port, protocol, pathname, search, hash } = window.location;
    if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
      window.location.replace(
        `${protocol}//localhost${port ? `:${port}` : ""}${pathname}${search}${hash}`,
      );
    }
  }, []);
  return null;
}

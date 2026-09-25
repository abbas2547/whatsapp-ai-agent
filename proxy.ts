import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// NOTE: proxy.ts runs in the Edge runtime. It must NEVER import "@/auth"
// (which pulls in lib/db.ts -> @prisma/client -> Node-only query engine).
// Session is checked optimistically by decoding the Auth.js JWT cookie.
// Full authorization still happens in layouts via requireSessionOrRedirect().
async function getSessionToken(request: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  try {
    const token = await getToken({ req: request, secret });
    if (token?.sub) return token;
  } catch {
    // fall through to secure-cookie attempt below
  }
  try {
    const token = await getToken({
      req: request,
      secret,
      cookieName: "__Secure-authjs.session-token",
      secureCookie: true,
    });
    return token?.sub ? token : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const token = await getSessionToken(request);
  const loggedIn = !!token;
  const url = new URL(request.url);
  const isApp = url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/inbox") ||
    url.pathname.startsWith("/contacts") ||
    url.pathname.startsWith("/leads") ||
    url.pathname.startsWith("/agents") ||
    url.pathname.startsWith("/automations") ||
    url.pathname.startsWith("/knowledge") ||
    url.pathname.startsWith("/calendar") ||
    url.pathname.startsWith("/analytics") ||
    url.pathname.startsWith("/integrations") ||
    url.pathname.startsWith("/billing") ||
    url.pathname.startsWith("/settings");
  if (isApp && !loggedIn) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }
  if ((url.pathname === "/login" || url.pathname === "/register") && loggedIn) {
    return NextResponse.redirect(new URL(token?.organizationId ? "/dashboard" : "/onboarding", url.origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

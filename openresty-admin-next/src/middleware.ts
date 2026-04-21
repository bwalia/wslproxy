import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth gate for the admin dashboard.
 *
 * Runs on the Edge/Node runtime before any page or API route.  This is the
 * production-grade equivalent of the client-side `useEffect(() => router.push("/login"))`
 * pattern — it prevents the protected page from rendering at all when the
 * user is not authenticated, eliminating the login-flash race condition.
 *
 * The auth cookie is set by the Lua backend (`/api/user/login` →
 * `Set-Cookie: wslproxy_token=…; HttpOnly; SameSite=Lax; Secure?`).  We
 * intentionally do NOT verify the JWT signature here — the Lua auth block
 * still performs full verification on every `/api/*` request.  This
 * middleware only checks cookie presence to prevent UI from rendering
 * behind the login wall.
 */

const AUTH_COOKIE = "wslproxy_token";

// Paths reachable WITHOUT auth.  Everything else requires the cookie.
const PUBLIC_PATHS = new Set<string>([
  "/login",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Next.js internals and static assets are excluded by the `matcher` below,
  // but we belt-and-suspender here too.
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const { pathname } = nextUrl;

  const hasAuthCookie = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  // Already logged in and landing on /login → bounce to dashboard.
  if (pathname === "/login" && hasAuthCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasAuthCookie) {
    const loginUrl = new URL("/login", request.url);
    // Preserve intended destination so login can bounce back after success.
    // Exclude bare "/" to avoid noisy redirect params on the landing page.
    if (pathname !== "/") {
      loginUrl.searchParams.set("returnTo", pathname + nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Run on every request EXCEPT:
 *  - /api/*   (proxied to Lua — it has its own auth gate)
 *  - /_next/* (build output)
 *  - Static files (identified by having a file extension)
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.).*)",
  ],
};

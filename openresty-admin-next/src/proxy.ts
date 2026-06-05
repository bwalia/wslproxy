import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Auth gate for the admin dashboard.  Implements Next.js 16's `proxy`
 * file convention (renamed from `middleware`).
 *
 * Runs before every page / API route render.  Production-grade
 * equivalent of the old client-side `useEffect(() => router.push("/login"))`
 * pattern — prevents the protected page from rendering at all when the
 * user is not authenticated, eliminating the login-flash race condition.
 *
 * The auth cookie is set by the Lua backend (`/api/user/login` →
 * `Set-Cookie: wslproxy_token=…; HttpOnly; SameSite=Lax; Secure?`).  We
 * intentionally do NOT verify the JWT signature here — the Lua auth
 * block still performs full verification on every `/api/*` request.
 * This proxy only checks cookie presence to keep UI from rendering
 * behind the login wall.
 */

const AUTH_COOKIE = "wslproxy_token";

// Exact paths reachable without auth.
const PUBLIC_PATHS = new Set<string>([
  "/login",
  // Prometheus metrics endpoint.  Scrapers don't carry the admin
  // login cookie, so middleware-level auth would lock them out; the
  // backend itself restricts access via `allow <cidr>` directives in
  // its nginx `location /metrics` block (see nginx-dev.conf.tmpl /
  // infra/ansible/roles/wslproxy/templates/nginx.conf.j2).  This proxy
  // is just the Next.js-side passthrough — the network ACL on the
  // upstream is the actual gate.
  "/metrics",
]);

// Path *prefixes* reachable without auth.  Use this for entire route
// trees (e.g. the (public) route group) where every nested page should
// be anonymous.  Keep it narrow — anything added here must consciously
// be safe for the open internet.
const PUBLIC_PREFIXES = ["/links"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return true;
    }
  }
  // Next.js internals and static assets are excluded by the `matcher` below,
  // but we belt-and-suspender here too.
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

export function proxy(request: NextRequest) {
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

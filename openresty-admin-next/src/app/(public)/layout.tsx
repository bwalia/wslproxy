import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Globe2 } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   Layout for the unauthenticated `(public)` route group.

   Why this is its own layout (not just a different page under the
   dashboard layout):

     1. The dashboard layout assumes a signed-in user — sidebar nav
        links, AppBar with profile picker, etc.  Rendering those for an
        anonymous visitor is both visually wrong and information-
        leaking ("here's a sidebar showing all our admin sections!").

     2. Keeping the public surface in its own route group makes the
        allow-list explicit.  `proxy.ts` opens a single prefix tree
        (`/links`) — anything we build here inherits the same auth-free
        contract without any one-off code.

   The layout itself is intentionally bare: a small brand strip at the
   top and a "Sign in" link in the corner so admins can still reach the
   dashboard.  No analytics, no third-party widgets — public surface
   stays slim by design.
   ────────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Public Links",
  // Public pages should be indexable; the root layout sets noindex for
  // the admin app, and this overrides for the public surface.
  robots: {
    index: true,
    follow: true,
  },
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur supports-backdrop-filter:bg-white/60 dark:border-slate-800 dark:bg-slate-900/80 dark:supports-backdrop-filter:bg-slate-900/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Plain anchors throughout — the (public) tree is small,
              and using <Link> here would make the route group depend
              on Next's typed-routes manifest being up to date for
              every typecheck.  Anchors also force a clean SSR-rendered
              page on entry, which is fine for an anonymous landing. */}
          <a
            href="/links"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-primary-600 dark:text-slate-100 dark:hover:text-primary-400"
          >
            <Globe2 className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
            WSL Proxy · Public Links
          </a>
          <a
            href="/login"
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Admin sign in →
          </a>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Powered by WSL Proxy
      </footer>
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { JetBrains_Mono, Poppins, Unbounded } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

// Same families as workstation-website (src/app/layout.js): Poppins for body
// and UI, Unbounded for display headings, JetBrains Mono for code and data.
const poppins = Poppins({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
});

const unbounded = Unbounded({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-unbounded",
  weight: ["500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

const siteName = "WSLProxy Admin";
const siteDescription =
  "Administration dashboard for WSLProxy — manage servers, rules, upstreams, WAF policies, SSL certificates, and more.";

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: "website",
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: siteDescription,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1c2c" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${unbounded.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans">
        {/* Prevent theme FOUC — key must match STORAGE_KEYS.theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="wslproxy.theme";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}})();`,
          }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <Providers>
          <Suspense
            fallback={
              <div
                className="flex min-h-screen items-center justify-center bg-[#f7f9fc] dark:bg-[#0b1c2c]"
                role="status"
                aria-label="Loading"
              >
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600 dark:border-slate-700 dark:border-t-primary-400" />
                <span className="sr-only">Loading&hellip;</span>
              </div>
            }
          >
            {children}
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}

"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card, { CardBody } from "@/components/ui/Card";

/**
 * API Docs — embeds the Swagger UI served by the Lua backend.
 *
 * Swagger UI lives at `${WSLPROXY_API_URL}/swagger/` (OpenResty-served
 * static HTML).  We forward the same path through Next.js rewrites so
 * the iframe loads same-origin AND Swagger's absolute asset paths
 * (`/swagger/openapi.json` etc.) resolve to the upstream too.  An
 * aliased prefix would 404 those.
 */

export default function ApiDocsPage() {
  return (
    // `min-h` (not `h`) using `svh` (small viewport height — stable
    // across mobile browser chrome reveal/hide).  Subtracting 12rem
    // accounts for AppBar (4rem), Footer (~4rem), and the dashboard
    // <main>'s vertical padding (3rem × 2).  Using fixed `h-[calc()]`
    // would double-scroll if the layout chrome grew (banners, toasts,
    // breadcrumbs) and create a dead zone at the bottom on every other
    // common viewport.
    <div className="flex min-h-[calc(100svh-12rem)] flex-col">
      <PageHeader
        title="API documentation"
        icon={BookOpen}
        subtitle="Interactive Swagger / OpenAPI explorer"
        actions={
          <Button
            variant="ghost"
            onClick={() => window.open("/swagger/", "_blank", "noopener,noreferrer")}
            aria-label="Open API docs in a new tab"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">Open in new tab</span>
          </Button>
        }
      />

      <Card className="flex-1 overflow-hidden">
        <CardBody className="h-full p-0">
          <iframe
            src="/swagger/"
            title="WSL Proxy API documentation"
            className="h-full w-full border-0"
            // Lock down iframe permissions — Swagger UI doesn't need any.
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </CardBody>
      </Card>
    </div>
  );
}

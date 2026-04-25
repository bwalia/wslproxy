"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Info,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import { cn } from "@/lib/utils/cn";
import { SEVERITY_BADGE } from "@/lib/dashboard/constants";
import type { AIAnalysisResponse, AccessLogEntry, ErrorLogEntry } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   Dashboard AI-insights widget.

   Mirrors the legacy openresty-admin/src/component/AiInsightsPanel —
   analyses the raw nginx error-log text (same endpoint that feeds the
   LogsSection below) through a local Ollama model and renders the
   structured envelope.

   Why raw text (not `/logs/errors` structured entries):
    - The structured endpoint isn't populated on every deployment —
      it depends on the metrics worker being set up.  The raw
      `/openresty/error_logs` file tail is always available.
    - Legacy dashboard used raw text, so this matches existing
      operator expectations + keeps prompt engineering consistent.

   The panel splits the raw text by newline, wraps each line in
   `{ raw: "..." }` so it matches the `AIAnalysisRequest.logs` shape,
   then forwards to `analyzeWithAI()`.
   ────────────────────────────────────────────────────────────────────────── */

export default function AiInsightsWidget() {
  const dp = useDataProvider();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIAnalysisResponse | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      // 1. Verify a local model is available — fail fast with a
      //    pointable error rather than letting `analyzeWithAI` 500.
      if (aiAvailable === null) {
        try {
          const models = await dp.getAIModels();
          const list = models?.data?.models ?? [];
          const available = list.length > 0;
          setAiAvailable(available);
          setModelName(models?.data?.default ?? null);
          if (!available) {
            notify(
              "No local Ollama models detected. Start Ollama and `ollama pull llama3.2` to enable analysis.",
              { type: "info" },
            );
            return;
          }
        } catch {
          /* fall through — analyze will surface the underlying error */
        }
      }

      // 2. Pull the same raw error log that LogsSection renders.
      //    The global ref is populated by LogsSection on mount; if
      //    it hasn't fetched yet, pull fresh ourselves.
      const globalRef = (window as unknown as {
        __wslproxyLogs?: { error?: string };
      }).__wslproxyLogs;
      let rawText = globalRef?.error ?? "";
      if (!rawText) {
        // Backend returns `{ data: { logs: "<raw text>" } }` for both
        // log endpoints.  Older deployments used `data.error_log` or
        // returned a bare string — accept all three shapes so the
        // widget works regardless of which version is running.
        const logs = (await dp.getLogs("openresty/error_logs")) as {
          data?: { logs?: string; error_log?: string } | string;
        };
        const payload = logs?.data;
        if (typeof payload === "string") {
          rawText = payload;
        } else if (payload && typeof payload === "object") {
          rawText = payload.logs ?? payload.error_log ?? "";
        }
      }

      // 3. Normalize into the `logs: (AccessLogEntry | ErrorLogEntry)[]`
      //    shape the analyser expects.  Legacy did the same — each
      //    entry gets a `raw` key carrying the original line.
      const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        notify("No recent error log entries to analyze", { type: "info" });
        return;
      }

      const logEntries = lines.map(
        (line): ErrorLogEntry | AccessLogEntry =>
          ({ raw: line }) as unknown as ErrorLogEntry,
      );

      // 4. Ship it.
      const res = await dp.analyzeWithAI({
        logs: logEntries,
        question:
          "Identify recurring errors, upstream failures, 5xx spikes, SSL issues, rate-limit hits and WAF blocks. Ignore successful 2xx entries unless they reveal a pattern.",
        context: "nginx/openresty reverse proxy error.log, last ~10 KB",
      });
      setResult(res?.data ?? null);
      if (!res?.data) {
        notify("Analysis returned no result", { type: "info" });
      }
    } catch (err) {
      notify(
        "Analysis failed: " + ((err as Error).message || String(err)),
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }, [dp, aiAvailable, notify]);

  const severityKey = (result?.severity ?? "low") as keyof typeof SEVERITY_BADGE;
  const severity = SEVERITY_BADGE[severityKey] ?? SEVERITY_BADGE.low;

  return (
    <Card>
      <Card.Header>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              AI Error Log Analysis
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Local Ollama — data never leaves this host
              {modelName ? ` · model: ${modelName}` : ""}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={run}
          disabled={loading || aiAvailable === false}
          icon={
            loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )
          }
        >
          {loading
            ? "Analyzing…"
            : result
              ? "Re-analyze"
              : "Analyze with AI"}
        </Button>
      </Card.Header>
      <Card.Body>
        {aiAvailable === false && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              No local Ollama models detected. Run{" "}
              <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/50">
                ollama pull llama3.2
              </code>{" "}
              on the host to enable analysis.
            </span>
          </div>
        )}

        {!result && aiAvailable !== false && !loading && (
          <div className="flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Click <em>Analyze with AI</em> to summarize recurring errors,
              cluster similar failures, and surface actionable fixes from the
              current nginx error log.
            </span>
          </div>
        )}

        {result && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant={severity.badge} size="sm">
                {severity.label}
              </Badge>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                aria-expanded={expanded}
              >
                {expanded ? "Collapse" : "Expand"}
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {result.analysis && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {result.analysis}
              </p>
            )}

            {expanded && (
              <>
                {Array.isArray(result.root_causes) &&
                  result.root_causes.length > 0 && (
                    <Section
                      icon={AlertTriangle}
                      iconTone="text-amber-500"
                      title={`Root Causes (${result.root_causes.length})`}
                    >
                      <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {result.root_causes.map((c, i) => (
                          <li
                            key={i}
                            className="rounded border-l-2 border-amber-300 bg-amber-50/40 px-3 py-1.5 dark:border-amber-700 dark:bg-amber-950/20"
                          >
                            {String(c)}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                {Array.isArray(result.recommendations) &&
                  result.recommendations.length > 0 && (
                    <Section
                      icon={Lightbulb}
                      iconTone="text-emerald-500"
                      title={`Recommendations (${result.recommendations.length})`}
                    >
                      <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                        {result.recommendations.map((r, i) => (
                          <li
                            key={i}
                            className="rounded border-l-2 border-emerald-300 bg-emerald-50/40 px-3 py-1.5 dark:border-emerald-700 dark:bg-emerald-950/20"
                          >
                            {String(r)}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}
              </>
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function Section({
  icon: Icon,
  iconTone,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", iconTone)} aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

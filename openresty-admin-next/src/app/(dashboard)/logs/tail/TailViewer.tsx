"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import {
  AlertOctagon,
  ArrowLeft,
  CaseUpper,
  FileText,
  Loader2,
  Regex,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { dataProvider } from "@/lib/api/data-provider";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import { formatNumber, formatBytes } from "@/lib/utils/formatters";
import type { LogSearchMatch, LogSearchResult } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   Interactive full-screen log viewer.

   Responsibilities:
    - Own search state + sync to URL (`?kind=error&q=...&regex=1&case=1`)
      so operators can share links during incidents.
    - Debounce query input so the server isn't hammered on every keystroke.
    - Render results as a virtualized-ish list (we cap to 1000 matches
      server-side, the DOM handles that comfortably without a virtual
      list dep).
    - Highlight matches inline.
    - Keyboard shortcuts: `/` focuses search, `Esc` clears query,
      `Alt+R` toggles regex, `Alt+C` toggles case sensitivity.
    - Auto-refresh toggle for "tail -f" style updates.
   ────────────────────────────────────────────────────────────────────────── */

type LogKind = "error" | "access";

const REFRESH_INTERVAL_MS = 5_000; // Auto-refresh cadence when enabled.
const DEBOUNCE_MS = 300;
const MAX_QUERY_LENGTH = 512;

export default function TailViewer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State (URL-synced) ───────────────────────────────────────────────

  const kindParam = searchParams.get("kind");
  const kind: LogKind = kindParam === "access" ? "access" : "error";
  const urlQuery = searchParams.get("q") ?? "";
  const useRegex = searchParams.get("regex") === "1";
  const caseSensitive = searchParams.get("case") === "1";

  // Local query state — debounced into the URL so rapid typing
  // doesn't spam the backend OR push dozens of history entries.
  const [queryInput, setQueryInput] = useState(urlQuery);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Search results + loading indicator.  We keep the previous result
  // visible during revalidation so the UI doesn't flash empty.
  const [result, setResult] = useState<LogSearchResult>({
    matches: [],
    scanned_bytes: 0,
    total_lines_scanned: 0,
    truncated: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // ── URL sync ─────────────────────────────────────────────────────────

  const updateUrl = useCallback(
    (patch: Partial<Record<"kind" | "q" | "regex" | "case", string>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v === undefined) next.delete(k);
        else next.set(k, v as string);
      }
      const qs = next.toString();
      // `scroll: false` keeps the results pane stationary on query
      // changes; the router would otherwise jump to the top.
      startTransition(() => {
        // Cast to Route: typedRoutes generates its union from compiled
        // routes; `/logs/tail` is new in this build so the literal
        // doesn't widen to Route until the next build hook runs.
        const href = (qs ? `/logs/tail?${qs}` : "/logs/tail") as Route;
        router.replace(href, { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce query input → URL.  Clearing (Esc) bypasses the debounce
  // so empty state feels snappy.
  useEffect(() => {
    if (queryInput === urlQuery) return;
    if (queryInput === "") {
      updateUrl({ q: "" });
      return;
    }
    const t = setTimeout(() => updateUrl({ q: queryInput }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [queryInput, urlQuery, updateUrl]);

  // ── Fetch ────────────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dataProvider.searchLogs({
        kind,
        q: urlQuery || undefined,
        regex: useRegex,
        caseSensitive,
        limit: 1000,
      });
      setResult(res?.data ?? {
        matches: [],
        scanned_bytes: 0,
        total_lines_scanned: 0,
        truncated: false,
      });
    } catch (err) {
      setError((err as Error).message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, [kind, urlQuery, useRegex, caseSensitive]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  // ── Auto-refresh ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(runSearch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, runSearch]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore keystrokes inside form controls except when they are
      // the search input itself (Esc / arrows there are fine).
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (!inField && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && target === searchInputRef.current) {
        setQueryInput("");
        return;
      }
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        updateUrl({ regex: useRegex ? "" : "1" });
        return;
      }
      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        updateUrl({ case: caseSensitive ? "" : "1" });
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [useRegex, caseSensitive, updateUrl]);

  // ── Derived state ────────────────────────────────────────────────────

  const title = kind === "error" ? "Error Log" : "Access Log";
  const Icon: LucideIcon = kind === "error" ? AlertOctagon : FileText;
  const iconTone =
    kind === "error"
      ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
      : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";

  const hasQuery = urlQuery.length > 0;
  const matchCount = result.matches.length;
  const hitLimit = matchCount >= 1000;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Header: kind tabs + search + toolbar */}
      <Card.Header className="flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            iconTone,
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Full-text search over the nginx log file.
          </p>
        </div>

        {/* Kind switcher */}
        <div
          role="tablist"
          aria-label="Log kind"
          className="ml-auto flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
        >
          {(["error", "access"] as LogKind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              type="button"
              onClick={() => updateUrl({ kind: k === "error" ? "" : k })}
              className={cn(
                "rounded px-2.5 py-1 capitalize transition-colors",
                kind === k
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative min-w-50 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={queryInput}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={
              useRegex
                ? "Search regex (PCRE)…"
                : "Search — press / to focus, Esc to clear"
            }
            aria-label="Search log lines"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-7 pr-7 font-mono text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {queryInput && (
            <button
              type="button"
              onClick={() => setQueryInput("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Toggles */}
        <ToolbarToggle
          icon={Regex}
          label="Regex"
          title="Toggle regex mode (Alt+R)"
          active={useRegex}
          onClick={() => updateUrl({ regex: useRegex ? "" : "1" })}
        />
        <ToolbarToggle
          icon={CaseUpper}
          label="Aa"
          title="Toggle case-sensitive (Alt+C)"
          active={caseSensitive}
          onClick={() => updateUrl({ case: caseSensitive ? "" : "1" })}
        />
        <ToolbarToggle
          icon={RefreshCw}
          label={autoRefresh ? "Live" : "Auto"}
          title={
            autoRefresh
              ? "Live tail on (refetches every 5s)"
              : "Click to enable live tail"
          }
          active={autoRefresh}
          onClick={() => setAutoRefresh((v) => !v)}
          spinning={autoRefresh}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          aria-label="Refresh now"
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </Card.Header>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            <strong className="font-mono text-slate-700 dark:text-slate-200 tabular-nums">
              {formatNumber(matchCount)}
            </strong>{" "}
            {matchCount === 1 ? "match" : "matches"}
            {hasQuery && (
              <>
                {" "}· scanned{" "}
                <span className="font-mono tabular-nums">
                  {formatNumber(result.total_lines_scanned)}
                </span>{" "}
                lines ({formatBytes(result.scanned_bytes)})
              </>
            )}
          </span>
          {hitLimit && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              result limit hit — refine the query
            </span>
          )}
          {result.truncated && (
            <span
              className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              title="Older lines beyond the scan window were not searched"
            >
              scan window truncated
            </span>
          )}
        </div>
        {error && (
          <span className="font-medium text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>

      {/* Results — vertical scroll only.  Long log lines wrap via
          `whitespace-pre-wrap break-all` on each row, so there's
          no need for horizontal overflow.  `overflow-x-hidden`
          belt-and-braces in case any child tries to be too wide. */}
      <div
        ref={resultsRef}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-300"
      >
        {loading && matchCount === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Searching…
          </div>
        ) : matchCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-500">
            <FileText className="h-8 w-8 opacity-50" aria-hidden="true" />
            <p className="text-sm">
              {hasQuery
                ? "No matching lines in the scan window"
                : "Log file is empty"}
            </p>
            {hasQuery && (
              <p className="text-xs opacity-70">
                Try a shorter query or toggle regex mode.
              </p>
            )}
          </div>
        ) : (
          <MatchList
            matches={result.matches}
            query={urlQuery}
            regex={useRegex}
            caseSensitive={caseSensitive}
          />
        )}
      </div>
    </Card>
  );
}

// ─── Toolbar toggle pill ────────────────────────────────────────────────

function ToolbarToggle({
  icon: Icon,
  label,
  title,
  active,
  onClick,
  spinning,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/30 dark:text-primary-300"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200",
      )}
    >
      <Icon
        className={cn("h-3 w-3", spinning && active && "animate-spin")}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

// ─── Result list with inline highlighting ───────────────────────────────

function MatchList({
  matches,
  query,
  regex,
  caseSensitive,
}: {
  matches: LogSearchMatch[];
  query: string;
  regex: boolean;
  caseSensitive: boolean;
}) {
  // Build a highlight matcher once per search instead of per-line.
  // For regex mode we compile the pattern client-side too; if the
  // pattern is invalid (server already filtered but pasted junk is
  // possible), fall back to literal.
  const highlightRe = useMemo(() => {
    if (!query) return null;
    try {
      if (regex) {
        return new RegExp(query, caseSensitive ? "g" : "gi");
      }
      // Escape literal query for RegExp safety.
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, caseSensitive ? "g" : "gi");
    } catch {
      return null;
    }
  }, [query, regex, caseSensitive]);

  // `w-full` on the list (not `min-w-max`) lets each row claim the
  // container's full width; long lines then wrap via
  // `whitespace-pre-wrap break-all` on the text span.  Line numbers
  // stay in a fixed-width left gutter so the rag on the right
  // doesn't walk back and forth as numbers grow.
  return (
    <ol className="w-full">
      {matches.map((m, i) => (
        <li
          key={`${m.lineno}-${i}`}
          className="group flex items-start gap-3 border-l-2 border-transparent px-4 py-0.5 hover:border-primary-500 hover:bg-slate-900/60"
        >
          <span className="w-12 shrink-0 select-none text-right text-slate-600 tabular-nums">
            {m.lineno}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-slate-300">
            <HighlightedText text={m.text} re={highlightRe} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function HighlightedText({
  text,
  re,
}: {
  text: string;
  re: RegExp | null;
}) {
  if (!re || !text) return <>{text}</>;
  const out: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  // `re.lastIndex` must be reset between calls since we reuse the
  // same RegExp across every line.
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    out.push(
      <mark
        key={key++}
        className="rounded bg-amber-400/40 px-0.5 text-amber-100"
      >
        {m[0]}
      </mark>,
    );
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // guard against zero-width matches
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return <>{out}</>;
}

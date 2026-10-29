"use client";

import { useCallback, useMemo, useState } from "react";
import { FlaskRound, Play } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import BotNav from "@/components/bot-management/BotNav";
import {
  ACTION_BADGE,
  CLASS_BADGE,
  IVT_BADGE,
  IVT_LABEL,
  simulateRequest,
  useBotOverview,
  type BotSimulation,
} from "@/components/bot-management/api";

/* "Would this request be blocked?" — scores a described request with the
   gateway's own fingerprint + identity code (POST /api/bot_defense/evaluate).
   Nothing is sent to the site and no counters move. */

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const NAV = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

const PRESETS: Record<string, { label: string; headers: Record<string, string> }> = {
  chrome: {
    label: "Chrome (real browser)",
    headers: { "User-Agent": CHROME, ...NAV, "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130"', "Sec-Fetch-Mode": "navigate" },
  },
  firefox: {
    label: "Firefox (real browser)",
    headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", ...NAV, "Sec-Fetch-Mode": "navigate" },
  },
  safari: {
    label: "Safari 17 (real browser)",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      ...NAV, "Sec-Fetch-Mode": "navigate",
    },
  },
  spoofed: { label: "Script posing as Chrome (UA only)", headers: { "User-Agent": CHROME, Accept: "*/*" } },
  curl: { label: "curl", headers: { "User-Agent": "curl/8.4.0", Accept: "*/*" } },
  python: { label: "python-requests", headers: { "User-Agent": "python-requests/2.31.0", Accept: "*/*", "Accept-Encoding": "gzip, deflate" } },
  headless: {
    label: "Headless Chrome",
    headers: { "User-Agent": CHROME.replace("Chrome/", "HeadlessChrome/"), ...NAV, "Sec-Fetch-Mode": "navigate" },
  },
  googlebot: {
    label: "Googlebot (claimed)",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", Accept: "text/html,*/*" },
  },
  sqlmap: { label: "sqlmap scanner", headers: { "User-Agent": "sqlmap/1.7.11#stable (https://sqlmap.org)", Accept: "*/*" } },
  none: { label: "No User-Agent", headers: { Accept: "*/*" } },
};

const toText = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n");
const fromText = (t: string) => {
  const h: Record<string, string> = {};
  t.split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return h;
};

export default function BotSimulatorPage() {
  const { data: overview } = useBotOverview();
  const [host, setHost] = useState("");
  const [preset, setPreset] = useState("chrome");
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/");
  const [scheme, setScheme] = useState<"https" | "http">("https");
  const [ip, setIp] = useState("203.0.113.10");
  const [headers, setHeaders] = useState(toText(PRESETS.chrome.headers));
  const [result, setResult] = useState<BotSimulation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const hostOptions = useMemo(
    () => [
      { value: "", label: "No server — default challenge policy" },
      ...(overview?.servers ?? []).map((s) => ({ value: s.server_name, label: `${s.server_name} (${s.mode})` })),
    ],
    [overview?.servers],
  );

  const run = useCallback(async () => {
    setRunning(true);
    setFailure(null);
    try {
      setResult(await simulateRequest({
        host: host || undefined, method, path, scheme, ip, http_version: 2.0, headers: fromText(headers),
      }));
    } catch (e) {
      setResult(null);
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [host, method, path, scheme, ip, headers]);

  return (
    <div>
      <PageHeader title="Bot simulator" icon={FlaskRound} subtitle="How would Bot Defense treat this request?" />
      <BotNav />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Request</h2>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              <Select label="Server (its policy is applied)" value={host} onChange={(e) => setHost(e.target.value)} options={hostOptions} />
              <Select
                label="Start from"
                value={preset}
                onChange={(e) => { setPreset(e.target.value); setHeaders(toText(PRESETS[e.target.value].headers)); }}
                options={Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}
                  options={["GET", "POST", "PUT", "DELETE", "HEAD"].map((m) => ({ value: m, label: m }))} />
                <Select label="Scheme" value={scheme} onChange={(e) => setScheme(e.target.value as "https" | "http")}
                  options={[{ value: "https", label: "https" }, { value: "http", label: "http" }]} />
                <Input label="Client IP" value={ip} onChange={(e) => setIp(e.target.value)} />
              </div>
              <Input label="Path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/checkout" />
              <Textarea
                label="Headers (Name: value, one per line)"
                rows={7}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={run} loading={running}>
                <Play className="h-4 w-4" aria-hidden="true" />
                <span className="ml-1.5">Score it</span>
              </Button>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Verdict</h2>
          </Card.Header>
          <Card.Body>
            {failure && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {failure}
              </div>
            )}
            {!result && !failure && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Describe a request and score it.</p>
            )}
            {result && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {result.class && <Badge variant={CLASS_BADGE[result.class]}>{result.class.replace("_", " ")}</Badge>}
                  <Badge variant={ACTION_BADGE[result.action] ?? "default"}>{result.action}</Badge>
                  {result.ivt && <Badge variant={IVT_BADGE[result.ivt]}>{IVT_LABEL[result.ivt]}</Badge>}
                  {typeof result.score === "number" && (
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      score <b className="tabular-nums">{result.score}</b>
                      {result.thresholds ? ` (suspect ≥ ${result.thresholds.challenge}, bot ≥ ${result.thresholds.block})` : ""}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-900 dark:text-slate-100">
                  <span className="text-slate-500 dark:text-slate-400">Response: </span>{result.response}
                  {result.mode ? <span className="text-slate-500 dark:text-slate-400"> · policy: {result.mode}</span> : null}
                </p>
                {result.crawler && (
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Claims to be the <b>{result.crawler}</b> crawler — reverse + forward DNS says <b>{result.crawler_verdict}</b>.
                  </p>
                )}
                {result.signals.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">Signal</th>
                        <th className="py-2 pr-3 font-medium">Why</th>
                        <th className="py-2 text-right font-medium">+</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.signals.map((s) => (
                        <tr key={s.code} className="border-b border-slate-100 align-top dark:border-slate-800">
                          <td className="py-2 pr-3"><code className="text-xs text-slate-800 dark:text-slate-200">{s.code}</code></td>
                          <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{s.what}</td>
                          <td className="py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{s.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-300">No signals: this request looks like a real browser.</p>
                )}
                {result.note && <p className="text-xs text-slate-500 dark:text-slate-400">{result.note}</p>}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  Brain,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Send,
  Loader2,
  Lightbulb,
  Bug,
  Shield,
  Zap,
  MessageSquare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useDataProvider } from "@/hooks/useResource";
import type { AccessLogEntry, AIAnalysisResponse, ErrorLogEntry } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

interface AIAnalysisPanelProps {
  selectedLogs: (AccessLogEntry | ErrorLogEntry)[];
  visible: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

// ── Severity styling ────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  critical: { icon: AlertTriangle, bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
  high: { icon: AlertTriangle, bg: "bg-orange-50 dark:bg-orange-900/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  medium: { icon: Bug, bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  low: { icon: CheckCircle2, bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-800" },
};

// ── Quick prompts ───────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { label: "Root cause analysis", icon: Bug, prompt: "Analyze these logs and identify the root cause of any errors or issues. Be specific about what's failing and why." },
  { label: "Performance issues", icon: Zap, prompt: "Identify any performance bottlenecks in these logs. Look at latency patterns, slow requests, and upstream response times." },
  { label: "Security concerns", icon: Shield, prompt: "Review these logs for security concerns: suspicious IPs, unusual patterns, potential attacks, WAF triggers, or unauthorized access attempts." },
  { label: "Fix suggestions", icon: Lightbulb, prompt: "Based on these logs, suggest specific fixes or configuration changes to resolve the issues. Include nginx/openresty config snippets where helpful." },
];

// ── Analysis result card ────────────────────────────────────────────────

const AnalysisResult = React.memo(function AnalysisResult({
  result,
}: {
  result: AIAnalysisResponse;
}) {
  const [expanded, setExpanded] = useState(true);
  const severity = result.severity || "low";
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  const SevIcon = config.icon;

  const copyToClipboard = useCallback(() => {
    const text = [
      result.analysis,
      result.root_causes?.length ? `\nRoot Causes:\n${result.root_causes.map((r) => `- ${r}`).join("\n")}` : "",
      result.recommendations?.length ? `\nRecommendations:\n${result.recommendations.map((r) => `- ${r}`).join("\n")}` : "",
    ].join("\n");
    navigator.clipboard.writeText(text);
  }, [result]);

  return (
    <div className={cn("rounded-lg border", config.border, config.bg)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <SevIcon className={cn("h-5 w-5", config.text)} />
          <span className={cn("font-semibold text-sm", config.text)}>
            AI Analysis
          </span>
          <Badge
            variant={severity === "critical" || severity === "high" ? "danger" : severity === "medium" ? "warning" : "success"}
            size="sm"
          >
            {severity.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); copyToClipboard(); }}
            className="rounded p-1 hover:bg-white/50 dark:hover:bg-slate-800/50"
            title="Copy analysis"
          >
            <Copy className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-inherit px-4 pb-4 pt-3 space-y-4">
          {/* Analysis text */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {result.analysis}
            </p>
          </div>

          {/* Root causes */}
          {result.root_causes && result.root_causes.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Bug className="h-3.5 w-3.5" /> Root Causes
              </h4>
              <ul className="space-y-1.5">
                {result.root_causes.map((cause, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    {cause}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Lightbulb className="h-3.5 w-3.5" /> Recommendations
              </h4>
              <ul className="space-y-1.5">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Related patterns */}
          {result.related_patterns && result.related_patterns.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.related_patterns.map((pattern, i) => (
                <Badge key={i} variant="default" size="sm">{pattern}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({
  selectedLogs,
  visible,
  onClose,
}) => {
  const dp = useDataProvider();
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AIAnalysisResponse[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatMode, setChatMode] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  // Check AI availability
  useEffect(() => {
    dp.getAIModels()
      .then((r) => setAiAvailable(r.data.models.length > 0))
      .catch(() => setAiAvailable(false));
  }, [dp]);

  const runAnalysis = useCallback(async (customPrompt?: string) => {
    if (selectedLogs.length === 0) return;
    setAnalyzing(true);
    try {
      const res = await dp.analyzeWithAI({
        logs: selectedLogs,
        question: customPrompt || "Analyze these logs for issues, errors, and anomalies. Provide root cause analysis and fix recommendations.",
        context: `Ingress controller logs from WSLProxy (OpenResty-based). Total: ${selectedLogs.length} entries.`,
      });
      setResults((prev) => [res.data, ...prev]);

      if (chatMode) {
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: customPrompt || "Analyze selected logs", timestamp: new Date() },
          { role: "assistant", content: res.data.analysis, timestamp: new Date() },
        ]);
      }
    } catch {
      setResults((prev) => [{
        analysis: "Failed to reach the AI service. Make sure your local LLM (Ollama) is running on the configured endpoint.",
        severity: "medium",
        root_causes: ["AI service unreachable — check if Ollama is running: `ollama serve`"],
        recommendations: [
          "Start Ollama: `ollama serve`",
          "Pull a model: `ollama pull llama3.2`",
          "Verify endpoint in WSLProxy settings",
        ],
      }, ...prev]);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedLogs, dp, chatMode]);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || analyzing) return;
    const question = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: question, timestamp: new Date() },
    ]);
    setAnalyzing(true);
    try {
      const res = await dp.analyzeWithAI({
        logs: selectedLogs,
        question,
        context: `Follow-up question about ${selectedLogs.length} ingress controller log entries.`,
      });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.data.analysis, timestamp: new Date() },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to get AI response. Is Ollama running?", timestamp: new Date() },
      ]);
    } finally {
      setAnalyzing(false);
    }
  }, [chatInput, analyzing, selectedLogs, dp]);

  if (!visible) return null;

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  AI Troubleshooting Assistant
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Powered by local LLM (Ollama) &middot; {selectedLogs.length} logs selected
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiAvailable !== null && (
                <Badge variant={aiAvailable ? "success" : "warning"} size="sm">
                  {aiAvailable ? "AI Connected" : "AI Offline"}
                </Badge>
              )}
              <button
                type="button"
                onClick={() => setChatMode(!chatMode)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  chatMode
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
                Chat Mode
              </button>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card.Header>

        <Card.Body className="space-y-4">
          {/* Quick action prompts */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_PROMPTS.map((qp) => {
              const Icon = qp.icon;
              return (
                <button
                  key={qp.label}
                  type="button"
                  disabled={analyzing || selectedLogs.length === 0}
                  onClick={() => runAnalysis(qp.prompt)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-medium transition-all",
                    "hover:border-primary-300 hover:bg-primary-50 hover:shadow-sm dark:border-slate-700 dark:hover:border-primary-700 dark:hover:bg-primary-900/20",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                  <span className="text-slate-700 dark:text-slate-300">{qp.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main analyze button */}
          {!chatMode && (
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                icon={analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                loading={analyzing}
                disabled={selectedLogs.length === 0}
                onClick={() => runAnalysis()}
              >
                {analyzing ? "Analyzing..." : `Analyze ${selectedLogs.length} Log Entries`}
              </Button>
              {results.length > 0 && (
                <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setResults([])}>
                  Clear Results
                </Button>
              )}
            </div>
          )}

          {/* Chat mode */}
          {chatMode && (
            <div className="space-y-3">
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                {chatMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">
                    Ask questions about the selected logs. The AI will analyze them in context.
                  </p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          msg.role === "user"
                            ? "bg-primary-600 text-white"
                            : "bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn("mt-1 text-xs", msg.role === "user" ? "text-primary-200" : "text-slate-400")}>
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {analyzing && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChat()}
                  placeholder="Ask about the logs... e.g., 'Why are 502s spiking?'"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
                <Button
                  variant="primary"
                  icon={<Send className="h-4 w-4" />}
                  onClick={handleChat}
                  disabled={!chatInput.trim() || analyzing}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          {/* Analysis results */}
          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((result, i) => (
                <AnalysisResult key={i} result={result} />
              ))}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default React.memo(AIAnalysisPanel);

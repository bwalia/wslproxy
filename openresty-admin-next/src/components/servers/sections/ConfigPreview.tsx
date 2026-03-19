"use client";

import React, { useCallback, useState } from "react";
import { Copy, Check, FileCode } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface ConfigPreviewProps {
  config: string;
  className?: string;
}

/* ── Component ─────────────────────────────────────────────────────────── */

const ConfigPreview: React.FC<ConfigPreviewProps> = ({ config, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available
    }
  }, [config]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Generated Nginx Configuration
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          icon={
            copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )
          }
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <pre
        className={cn(
          "w-full overflow-auto rounded-lg border p-4 text-xs leading-relaxed",
          "bg-slate-900 text-green-400 border-slate-700",
          "dark:bg-slate-950 dark:border-slate-800",
          "font-mono whitespace-pre-wrap break-words",
          "max-h-[600px]",
        )}
      >
        {config || "# Configuration will appear here once fields are populated."}
      </pre>
    </div>
  );
};

ConfigPreview.displayName = "ConfigPreview";

export default React.memo(ConfigPreview);

"use client";

/**
 * JsonConfigTab — pretty-prints the on-disk JSON record for a resource
 * so the operator can compare "what the form is rendering" against
 * "what's actually persisted".
 *
 * Data source: the object returned by the standard GET endpoint
 * (`/api/{resource}/{id}`).  api.lua reads the file from
 * `data/{resource}/{env}/{id}.json` and returns its contents verbatim
 * with a small number of convenience decodes:
 *   - servers: `config` and `varnish_vcl_config` are base64-decoded
 *     to their raw nginx / VCL text
 *   - rules:   `jwt_token_validation_key` is base64-decoded
 *
 * Everything else is byte-for-byte the on-disk shape.  The decodes are
 * why the plaintext is useful here — showing the raw base64 blob would
 * be opaque and defeat the point of the tab.  A short banner at the
 * top of the panel makes that transformation explicit.
 */

import { useMemo, useState, useCallback } from "react";
import { Copy, Check, Download, FileJson } from "lucide-react";
import Card from "./Card";
import Button from "./Button";

interface JsonConfigTabProps {
  /** The record fetched from the API.  Pretty-printed as-is. */
  data: unknown;
  /**
   * Default filename (without extension) offered by the Download
   * button.  Falls back to `configuration` when omitted.
   */
  downloadName?: string;
  /**
   * Names of fields the backend decodes from base64 before returning
   * (so we can tell the user which fields look different from the
   * raw file on disk).  Omit or pass an empty list to hide the note.
   */
  decodedFields?: string[];
}

export default function JsonConfigTab({
  data,
  downloadName = "configuration",
  decodedFields = [],
}: JsonConfigTabProps) {
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => {
    if (data == null) return "";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const handleCopy = useCallback(async () => {
    if (!pretty) return;
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard rejects on non-HTTPS origins and some sandboxed
      // iframes.  Silently no-op — the user can still select the text
      // by hand from the <pre> block.
    }
  }, [pretty]);

  const handleDownload = useCallback(() => {
    if (!pretty) return;
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${downloadName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pretty, downloadName]);

  if (!data) {
    return (
      <Card>
        <Card.Body>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No record loaded — save this record first to inspect its stored JSON.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary-500" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Configuration JSON
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              The record as stored on disk. Use this to compare what the form is
              rendering against what is actually persisted.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopy}
            icon={
              copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownload}
            icon={<Download className="h-4 w-4" />}
          >
            Download
          </Button>
        </div>
      </Card.Header>
      <Card.Body>
        {decodedFields.length > 0 && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            The backend decodes these field(s) from base64 before returning them,
            so the plaintext you see here differs from the raw file on disk:{" "}
            <span className="font-mono">{decodedFields.join(", ")}</span>. Every
            other field is byte-for-byte identical to the on-disk record.
          </div>
        )}
        <pre className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <code>{pretty}</code>
        </pre>
      </Card.Body>
    </Card>
  );
}

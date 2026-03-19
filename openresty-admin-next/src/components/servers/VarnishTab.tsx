"use client";

import React, { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { ServerFormState, VarnishSnippet } from "./types";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface VarnishTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const VCL_HOOK_POINTS = [
  { value: "vcl_recv", label: "vcl_recv" },
  { value: "vcl_hash", label: "vcl_hash" },
  { value: "vcl_hit", label: "vcl_hit" },
  { value: "vcl_miss", label: "vcl_miss" },
  { value: "vcl_backend_fetch", label: "vcl_backend_fetch" },
  { value: "vcl_backend_response", label: "vcl_backend_response" },
  { value: "vcl_deliver", label: "vcl_deliver" },
  { value: "vcl_synth", label: "vcl_synth" },
  { value: "vcl_init", label: "vcl_init" },
];

/* ── Component ─────────────────────────────────────────────────────────── */

const VarnishTab: React.FC<VarnishTabProps> = ({ form, setForm }) => {
  const handleToggle = useCallback(
    (val: boolean) => {
      setForm((prev) => ({ ...prev, varnish_enabled: val }));
    },
    [setForm],
  );

  const handleVarnishConfigChange = useCallback(
    (field: string, value: string | number | boolean) => {
      setForm((prev) => ({
        ...prev,
        varnish_config: { ...prev.varnish_config, [field]: value },
      }));
    },
    [setForm],
  );

  const handleVclConfigChange = useCallback(
    (value: string) => {
      setForm((prev) => ({ ...prev, varnish_vcl_config: value }));
    },
    [setForm],
  );

  /* -- Snippet management -- */
  const handleAddSnippet = useCallback(() => {
    const snippet: VarnishSnippet = {
      name: "",
      enabled: true,
      priority: 0,
      hook_point: "vcl_recv",
      content: "",
    };
    setForm((prev) => ({
      ...prev,
      varnish_snippets: [...prev.varnish_snippets, snippet],
    }));
  }, [setForm]);

  const handleRemoveSnippet = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        varnish_snippets: prev.varnish_snippets.filter((_, i) => i !== index),
      }));
    },
    [setForm],
  );

  const handleSnippetChange = useCallback(
    (index: number, field: keyof VarnishSnippet, value: string | number | boolean) => {
      setForm((prev) => ({
        ...prev,
        varnish_snippets: prev.varnish_snippets.map((s, i) =>
          i === index ? { ...s, [field]: value } : s,
        ),
      }));
    },
    [setForm],
  );

  if (!form.varnish_enabled) {
    return (
      <Card>
        <Card.Body>
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Varnish Reverse Proxy
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Enable Varnish to add a powerful caching layer in front of your backend servers.
              </p>
            </div>
            <Button onClick={() => handleToggle(true)}>
              Enable Varnish
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Toggle ───────────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Varnish Reverse Proxy
          </h2>
          <Badge variant="success" size="sm">
            Enabled
          </Badge>
        </Card.Header>
        <Card.Body>
          <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.varnish_enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Enable Varnish Caching Layer
          </label>
        </Card.Body>
      </Card>

      {/* ── Listener Configuration ───────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Listener Configuration
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Listen Address"
              placeholder="0.0.0.0"
              value={form.varnish_config.listen_address}
              onChange={(e) => handleVarnishConfigChange("listen_address", e.target.value)}
            />
            <Input
              label="Listen Port"
              type="number"
              placeholder="6081"
              value={form.varnish_config.listen_port}
              onChange={(e) => handleVarnishConfigChange("listen_port", e.target.value)}
            />
            <Input
              label="Admin Listen Port"
              type="number"
              placeholder="6082"
              value={form.varnish_config.admin_listen_port}
              onChange={(e) => handleVarnishConfigChange("admin_listen_port", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      {/* ── Cache Settings ───────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Cache Settings
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Default Cache TTL"
              placeholder="120s"
              value={form.varnish_config.cache_ttl_default}
              onChange={(e) => handleVarnishConfigChange("cache_ttl_default", e.target.value)}
              hint="e.g. 120s, 5m, 1h"
            />
            <Input
              label="Cache Grace Period"
              placeholder="6h"
              value={form.varnish_config.cache_grace}
              onChange={(e) => handleVarnishConfigChange("cache_grace", e.target.value)}
              hint="How long to serve stale content"
            />
            <Input
              label="Cache Keep"
              placeholder="8h"
              value={form.varnish_config.cache_keep}
              onChange={(e) => handleVarnishConfigChange("cache_keep", e.target.value)}
              hint="How long to keep cached objects for IMS"
            />
            <Input
              label="Cache Size"
              placeholder="256m"
              value={form.varnish_config.cache_size}
              onChange={(e) => handleVarnishConfigChange("cache_size", e.target.value)}
              hint="e.g. 256m, 1g"
            />
          </div>
        </Card.Body>
      </Card>

      {/* ── Backend Timeouts ─────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Backend Timeouts
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="Connect Timeout"
              placeholder="5s"
              value={form.varnish_config.backend_connect_timeout}
              onChange={(e) => handleVarnishConfigChange("backend_connect_timeout", e.target.value)}
            />
            <Input
              label="First Byte Timeout"
              placeholder="60s"
              value={form.varnish_config.backend_first_byte_timeout}
              onChange={(e) => handleVarnishConfigChange("backend_first_byte_timeout", e.target.value)}
            />
            <Input
              label="Between Bytes Timeout"
              placeholder="10s"
              value={form.varnish_config.backend_between_bytes_timeout}
              onChange={(e) => handleVarnishConfigChange("backend_between_bytes_timeout", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      {/* ── Health Check ─────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Health Check
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.varnish_config.health_check_enabled}
                onChange={(e) => handleVarnishConfigChange("health_check_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable Backend Health Checks
            </label>

            {form.varnish_config.health_check_enabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Health Check URL"
                  placeholder="/health"
                  value={form.varnish_config.health_check_url}
                  onChange={(e) => handleVarnishConfigChange("health_check_url", e.target.value)}
                />
                <Input
                  label="Check Interval"
                  placeholder="5s"
                  value={form.varnish_config.health_check_interval}
                  onChange={(e) => handleVarnishConfigChange("health_check_interval", e.target.value)}
                />
                <Input
                  label="Check Timeout"
                  placeholder="2s"
                  value={form.varnish_config.health_check_timeout}
                  onChange={(e) => handleVarnishConfigChange("health_check_timeout", e.target.value)}
                />
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── VCL Snippets ─────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            VCL Snippets
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddSnippet}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Snippet
          </Button>
        </Card.Header>
        <Card.Body>
          {form.varnish_snippets.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
              No VCL snippets configured. Add one to customize Varnish behavior.
            </p>
          )}

          <div className="space-y-4">
            {form.varnish_snippets.map((snippet, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={snippet.enabled ? "success" : "default"} size="sm">
                      {snippet.enabled ? "Active" : "Disabled"}
                    </Badge>
                    {snippet.name && (
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {snippet.name}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSnippet(idx)}
                    className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    aria-label="Remove snippet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input
                    label="Snippet Name"
                    placeholder="my-snippet"
                    value={snippet.name}
                    onChange={(e) => handleSnippetChange(idx, "name", e.target.value)}
                  />
                  <Select
                    label="Hook Point"
                    value={snippet.hook_point}
                    onChange={(e) => handleSnippetChange(idx, "hook_point", e.target.value)}
                    options={VCL_HOOK_POINTS}
                  />
                  <Input
                    label="Priority"
                    type="number"
                    value={String(snippet.priority)}
                    onChange={(e) => handleSnippetChange(idx, "priority", Number(e.target.value))}
                  />
                </div>

                <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={snippet.enabled}
                    onChange={(e) => handleSnippetChange(idx, "enabled", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Enabled
                </label>

                <Textarea
                  label="VCL Content"
                  placeholder={'if (req.url ~ "^/api/") { return (pass); }'}
                  rows={5}
                  value={snippet.content}
                  onChange={(e) => handleSnippetChange(idx, "content", e.target.value)}
                />
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* ── Raw VCL Config ───────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Raw VCL Configuration
          </h2>
        </Card.Header>
        <Card.Body>
          <Textarea
            label="VCL Config Override"
            hint="Advanced: Raw VCL configuration that will be appended to the generated config."
            placeholder="# Custom VCL here..."
            rows={10}
            value={form.varnish_vcl_config}
            onChange={(e) => handleVclConfigChange(e.target.value)}
          />
        </Card.Body>
      </Card>
    </div>
  );
};

VarnishTab.displayName = "VarnishTab";

export default React.memo(VarnishTab);

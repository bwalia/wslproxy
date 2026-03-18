"use client";

import React, { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ArrayFieldEditor from "./sections/ArrayFieldEditor";
import LocationBlockEditor from "./sections/LocationBlockEditor";
import ConfigPreview from "./sections/ConfigPreview";
import type { ServerFormState } from "./types";
import type { LocationEntry } from "./sections/LocationBlockEditor";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface NginxServerTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
  isCreate: boolean;
  profileOptions: { value: string; label: string }[];
  wafPolicyOptions: { value: string; label: string }[];
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const MIME_TYPE_OPTIONS = [
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/json",
  "application/xml",
  "text/xml",
  "text/plain",
  "text/html",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
  "application/pdf",
  "audio/mpeg",
  "video/mp4",
  "video/webm",
];

const WAF_MODE_OPTIONS = [
  { value: "", label: "Default (use policy mode)" },
  { value: "block", label: "Block" },
  { value: "monitor", label: "Monitor" },
];

/* ── Component ─────────────────────────────────────────────────────────── */

const NginxServerTab: React.FC<NginxServerTabProps> = ({
  form,
  setForm,
  isCreate,
  profileOptions,
  wafPolicyOptions,
}) => {
  /* ── Helpers ──────────────────────────────────────────────────────── */

  const handleChange = useCallback(
    <K extends keyof ServerFormState>(field: K, value: ServerFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [setForm],
  );

  const handleNestedChange = useCallback(
    (field: string, value: string | number | boolean) => {
      setForm((prev) => ({
        ...prev,
        rate_limit: { ...prev.rate_limit, [field]: value },
      }));
    },
    [setForm],
  );

  /* -- Tag management -- */
  const [tagInput, setTagInput] = React.useState("");

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !form.servers_tags.includes(tag)) {
      handleChange("servers_tags", [...form.servers_tags, tag]);
    }
    setTagInput("");
  }, [tagInput, form.servers_tags, handleChange]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      handleChange(
        "servers_tags",
        form.servers_tags.filter((t) => t !== tag),
      );
    },
    [form.servers_tags, handleChange],
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag],
  );

  /* -- Listen ports -- */
  const handleAddListen = useCallback(() => {
    handleChange("listens", [...form.listens, { listen: "80" }]);
  }, [form.listens, handleChange]);

  const handleRemoveListen = useCallback(
    (index: number) => {
      handleChange(
        "listens",
        form.listens.filter((_, i) => i !== index),
      );
    },
    [form.listens, handleChange],
  );

  const handleListenChange = useCallback(
    (index: number, val: string) => {
      const next = form.listens.map((l, i) =>
        i === index ? { listen: val } : l,
      );
      handleChange("listens", next);
    },
    [form.listens, handleChange],
  );

  /* -- MIME type multi-select -- */
  const handleToggleMime = useCallback(
    (mime: string) => {
      const current = form.cached_mime_types;
      if (current.includes(mime)) {
        handleChange(
          "cached_mime_types",
          current.filter((m) => m !== mime),
        );
      } else {
        handleChange("cached_mime_types", [...current, mime]);
      }
    },
    [form.cached_mime_types, handleChange],
  );

  /* -- Locations -- */
  const handleLocationsChange = useCallback(
    (next: LocationEntry[]) => {
      handleChange("locations", next);
    },
    [handleChange],
  );

  /* -- Custom headers -- */
  const handleCustomHeadersChange = useCallback(
    (next: Record<string, string>[]) => {
      handleChange(
        "custom_headers",
        next as { header_key: string; header_value: string }[],
      );
    },
    [handleChange],
  );

  const handleCustomResponseHeadersChange = useCallback(
    (next: Record<string, string>[]) => {
      handleChange(
        "custom_response_headers",
        next as { header_key: string; header_value: string }[],
      );
    },
    [handleChange],
  );

  /* -- Custom blocks -- */
  const handleCustomBlockChange = useCallback(
    (next: Record<string, string>[]) => {
      handleChange(
        "custom_block",
        next as { additional_block: string }[],
      );
    },
    [handleChange],
  );

  const handleCustomLocationBlockChange = useCallback(
    (next: Record<string, string>[]) => {
      handleChange(
        "custom_location_block",
        next as { additional_location_block: string }[],
      );
    },
    [handleChange],
  );

  const handleCustomHttpBlockChange = useCallback(
    (next: Record<string, string>[]) => {
      handleChange(
        "custom_http_block",
        next as { additional_http_block: string }[],
      );
    },
    [handleChange],
  );

  const mimeSelectOptions = useMemo(
    () => MIME_TYPE_OPTIONS.map((m) => ({ value: m, label: m })),
    [],
  );

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Basic Server Config ──────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Basic Server Config
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Server Name"
              placeholder="example.com"
              value={form.server_name}
              onChange={(e) => handleChange("server_name", e.target.value)}
              disabled={!isCreate}
              hint={!isCreate ? "Server name cannot be changed after creation" : undefined}
            />
            <Input
              label="Proxy Server Name"
              placeholder="proxy.example.com"
              value={form.proxy_server_name}
              onChange={(e) => handleChange("proxy_server_name", e.target.value)}
            />
            <Select
              label="Profile"
              value={form.profile_id}
              onChange={(e) => handleChange("profile_id", e.target.value)}
              options={profileOptions}
              placeholder="Select a profile"
            />
            <Input
              label="Root"
              placeholder="/var/www/html"
              value={form.root}
              onChange={(e) => handleChange("root", e.target.value)}
            />
            <Input
              label="Index"
              placeholder="index.html"
              value={form.index}
              onChange={(e) => handleChange("index", e.target.value)}
            />
            <Input
              label="Access Log"
              placeholder="logs/access.log"
              value={form.access_log}
              onChange={(e) => handleChange("access_log", e.target.value)}
            />
            <Input
              label="Error Log"
              placeholder="logs/error.log"
              value={form.error_log}
              onChange={(e) => handleChange("error_log", e.target.value)}
            />
          </div>

          {/* Tags */}
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Server Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {form.servers_tags.map((tag) => (
                <Badge key={tag} variant="primary" size="sm">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1.5 inline-flex hover:text-red-500 transition-colors"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
              <Button variant="secondary" size="sm" onClick={handleAddTag} className="shrink-0 mt-auto">
                Add
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* ── Listen Ports ─────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Listen Ports
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-2">
            {form.listens.map((l, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={idx === 0 ? "Port" : undefined}
                    placeholder="80"
                    value={l.listen}
                    onChange={(e) => handleListenChange(idx, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveListen(idx)}
                  className="mb-1 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                  aria-label="Remove port"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddListen}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Add Listen Port
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ── SSL Certificate ──────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            SSL Certificate
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.ssl_enabled}
                onChange={(e) => handleChange("ssl_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable SSL
            </label>

            {form.ssl_enabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="SSL Email"
                  type="email"
                  placeholder="admin@example.com"
                  value={form.ssl_email}
                  onChange={(e) => handleChange("ssl_email", e.target.value)}
                  error={
                    form.ssl_enabled && form.ssl_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ssl_email)
                      ? "Please enter a valid email address"
                      : undefined
                  }
                />
                <div className="space-y-3 md:col-span-2">
                  <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.ssl_auto_renew}
                      onChange={(e) => handleChange("ssl_auto_renew", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    Auto Renew Certificate
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.ssl_force_https}
                      onChange={(e) => handleChange("ssl_force_https", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    Force HTTPS Redirect
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.ssl_staging}
                      onChange={(e) => handleChange("ssl_staging", e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    Use Staging Environment (Let&apos;s Encrypt)
                  </label>
                </div>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Static Content Caching ───────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Static Content Caching
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.cache_enabled}
                onChange={(e) => handleChange("cache_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable Caching
            </label>

            {form.cache_enabled && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Cache TTL (seconds)"
                    type="number"
                    value={String(form.cache_ttl)}
                    onChange={(e) => handleChange("cache_ttl", Number(e.target.value))}
                  />
                  <Input
                    label="Cache Bypass Cookie"
                    placeholder="session_id"
                    value={form.cache_bypass_cookie}
                    onChange={(e) => handleChange("cache_bypass_cookie", e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.cache_bypass_auth}
                    onChange={(e) => handleChange("cache_bypass_auth", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  Bypass Cache for Authenticated Requests
                </label>

                {/* MIME Type multi-select */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Cached MIME Types
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MIME_TYPE_OPTIONS.map((mime) => {
                      const selected = form.cached_mime_types.includes(mime);
                      return (
                        <button
                          key={mime}
                          type="button"
                          onClick={() => handleToggleMime(mime)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 ring-1 ring-primary-300 dark:ring-primary-600"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600",
                          )}
                        >
                          {mime}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── WAF (Nginx-level) ────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            WAF Settings
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.waf_enabled}
                onChange={(e) => handleChange("waf_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable WAF
            </label>

            {form.waf_enabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="WAF Policy"
                  value={form.waf_policy_id}
                  onChange={(e) => handleChange("waf_policy_id", e.target.value)}
                  options={wafPolicyOptions}
                  placeholder="Select a WAF policy"
                />
                <Select
                  label="WAF Mode Override"
                  value={form.waf_mode_override}
                  onChange={(e) => handleChange("waf_mode_override", e.target.value)}
                  options={WAF_MODE_OPTIONS}
                />
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Rate Limiting ────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Rate Limiting
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.rate_limit_enabled}
                onChange={(e) => handleChange("rate_limit_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable Rate Limiting
            </label>

            {form.rate_limit_enabled && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Requests per Second"
                  type="number"
                  value={String(form.rate_limit.requests_per_second)}
                  onChange={(e) => handleNestedChange("requests_per_second", Number(e.target.value))}
                />
                <Input
                  label="Burst"
                  type="number"
                  value={String(form.rate_limit.burst)}
                  onChange={(e) => handleNestedChange("burst", Number(e.target.value))}
                />
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Custom Headers ───────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Custom Headers
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-6">
            <ArrayFieldEditor
              label="Request Headers"
              columns={[
                { key: "header_key", label: "Header Name", placeholder: "X-Custom-Header" },
                { key: "header_value", label: "Header Value", placeholder: "value" },
              ]}
              value={form.custom_headers}
              onChange={handleCustomHeadersChange}
              addLabel="Add Header"
              emptyMessage="No custom request headers."
            />
            <ArrayFieldEditor
              label="Response Headers"
              columns={[
                { key: "header_key", label: "Header Name", placeholder: "X-Response-Header" },
                { key: "header_value", label: "Header Value", placeholder: "value" },
              ]}
              value={form.custom_response_headers}
              onChange={handleCustomResponseHeadersChange}
              addLabel="Add Header"
              emptyMessage="No custom response headers."
            />
          </div>
        </Card.Body>
      </Card>

      {/* ── Location Blocks ──────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Location Blocks
          </h2>
        </Card.Header>
        <Card.Body>
          <LocationBlockEditor
            value={form.locations}
            onChange={handleLocationsChange}
          />
        </Card.Body>
      </Card>

      {/* ── Advanced Config Blocks ────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Advanced Config Blocks
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="space-y-6">
            <ArrayFieldEditor
              label="Custom Server Blocks"
              columns={[
                {
                  key: "additional_block",
                  label: "Server Block Content",
                  placeholder: "add_header X-Frame-Options DENY;",
                  type: "textarea",
                },
              ]}
              value={form.custom_block}
              onChange={handleCustomBlockChange}
              addLabel="Add Block"
              emptyMessage="No custom server blocks."
            />
            <ArrayFieldEditor
              label="Custom Location Blocks"
              columns={[
                {
                  key: "additional_location_block",
                  label: "Location Block Content",
                  placeholder: "proxy_set_header Host $host;",
                  type: "textarea",
                },
              ]}
              value={form.custom_location_block}
              onChange={handleCustomLocationBlockChange}
              addLabel="Add Block"
              emptyMessage="No custom location blocks."
            />
            <ArrayFieldEditor
              label="Custom HTTP Blocks"
              columns={[
                {
                  key: "additional_http_block",
                  label: "HTTP Block Content",
                  placeholder: "map $http_upgrade $connection_upgrade { ... }",
                  type: "textarea",
                },
              ]}
              value={form.custom_http_block}
              onChange={handleCustomHttpBlockChange}
              addLabel="Add Block"
              emptyMessage="No custom HTTP blocks."
            />
          </div>
        </Card.Body>
      </Card>

      {/* ── Config Preview ───────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Configuration Preview
          </h2>
        </Card.Header>
        <Card.Body>
          <ConfigPreview config={form.config} />
        </Card.Body>
      </Card>
    </div>
  );
};

NginxServerTab.displayName = "NginxServerTab";

export default React.memo(NginxServerTab);

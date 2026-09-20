"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ArrowLeft,
  Save,
  Trash2,
  Globe2,
  AlertTriangle,
  Power,
  PowerOff,
} from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Badge from "@/components/ui/Badge";
import type { Pop } from "@/types";

/**
 * Create / edit / delete a POP.
 *
 * `/pops/create`  — create-mode (id editable, no delete button)
 * `/pops/{id}`    — edit-mode (id read-only, delete button visible)
 *
 * Delete refuses with 409 + a list of referencing servers when in
 * use; the confirm dialog surfaces that list and offers `force=true`
 * to cascade-detach.  Mirrors the backend's posture exactly.
 */

const STATUS_OPTIONS = [
  { value: "active", label: "Active — in rotation" },
  { value: "draining", label: "Draining — finish in-flight only" },
  { value: "down", label: "Down — unplanned (pages oncall)" },
  { value: "maintenance", label: "Maintenance — planned (no page)" },
];

interface ReferencingServer {
  server_id: string;
  server_name?: string;
  profile_id: string;
}

interface PopBackendError {
  error?: string;
  message?: string;
  details?:
    | Array<{ field: string; message: string }>
    | { referencing_servers?: ReferencingServer[]; existing_id?: string };
}

// Empty form shape used on /pops/create and as the reset target.  All
// optional fields default to empty strings (Input prefers controlled
// strings) and the form normalises to nulls / numbers at submit time.
const EMPTY_FORM = {
  id: "",
  display_name: "",
  region: "",
  country_code: "",
  city: "",
  lat: "",
  lng: "",
  public_ipv4: "",
  public_ipv6: "",
  internal_hostname: "",
  status: "active",
  capacity_weight: "1.0",
  provider: "",
  tags: "", // comma-separated in the form, split on submit
};

export default function PopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<Pop>(
    isCreate ? null : "pops",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [referencingServers, setReferencingServers] = useState<
    ReferencingServer[] | null
  >(null);
  // Field-level errors keyed by field name.  Populated from the
  // backend's 400 validation_failed response which carries
  // `details: [{field, message}]`.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      // Hydrate form from the loaded record.  Empty-string display
      // (rather than undefined) keeps inputs controlled.
      setForm({
        id: data.id ?? "",
        display_name: data.display_name ?? "",
        region: data.region ?? "",
        country_code: data.country_code ?? "",
        city: data.city ?? "",
        lat: data.lat !== undefined && data.lat !== null ? String(data.lat) : "",
        lng: data.lng !== undefined && data.lng !== null ? String(data.lng) : "",
        public_ipv4: data.public_ipv4 ?? "",
        public_ipv6: data.public_ipv6 ?? "",
        internal_hostname: data.internal_hostname ?? "",
        status: data.status ?? "active",
        capacity_weight:
          data.capacity_weight !== undefined && data.capacity_weight !== null
            ? String(data.capacity_weight)
            : "1.0",
        provider: data.provider ?? "",
        tags: Array.isArray(data.tags) ? data.tags.join(", ") : "",
      });
    }
  }, [data]);

  const handleChange = useCallback(
    (field: keyof typeof form, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear the field error as soon as the user starts typing in
      // that field — saves them having to wait until next submit.
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  /** Translate form → API payload.  Numeric fields parse here so
   *  the Pop type's contract (numbers, not strings) is upheld at the
   *  network boundary, and empty strings become `null` / `undefined`
   *  so the on-disk shape stays clean. */
  const buildPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      display_name: form.display_name.trim(),
      public_ipv4: form.public_ipv4.trim(),
      status: form.status,
    };
    if (isCreate) payload.id = form.id.trim();
    if (form.region.trim()) payload.region = form.region.trim();
    if (form.country_code.trim())
      payload.country_code = form.country_code.trim().toUpperCase();
    if (form.city.trim()) payload.city = form.city.trim();
    if (form.lat.trim()) payload.lat = Number(form.lat);
    if (form.lng.trim()) payload.lng = Number(form.lng);
    if (form.public_ipv6.trim()) payload.public_ipv6 = form.public_ipv6.trim();
    if (form.internal_hostname.trim())
      payload.internal_hostname = form.internal_hostname.trim();
    if (form.capacity_weight.trim())
      payload.capacity_weight = Number(form.capacity_weight);
    if (form.provider.trim()) payload.provider = form.provider.trim();
    if (form.tags.trim()) {
      payload.tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    return payload;
  }, [form, isCreate]);

  // Translate the backend's structured error envelope into
  // field-level errors + a notification.  Reads from the flat
  // ApiError shape — `message`, `code`, `details` live directly on
  // the instance; parseBackendError populates them from the
  // backend's nested `{ error: { message, code, details } }` body.
  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      const errObj = err as {
        message?: string;
        code?: string;
        details?: unknown;
      };
      const details = errObj?.details;
      if (Array.isArray(details)) {
        const map: Record<string, string> = {};
        for (const d of details as Array<{ field?: string; message?: string }>) {
          if (d.field && d.message) map[d.field] = d.message;
        }
        setFieldErrors(map);
        notify(errObj.message || fallback, { type: "error" });
        return;
      }
      notify(errObj?.message || fallback, { type: "error" });
    },
    [notify],
  );

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = buildPayload();
      if (isCreate) {
        await dataProvider.create("pops", payload);
        notify("POP created", { type: "success" });
      } else {
        await dataProvider.update("pops", id, payload);
        notify("POP updated", { type: "success" });
      }
      router.push("/pops" as Route);
    } catch (err) {
      handleApiError(err, "Failed to save POP");
    } finally {
      setSaving(false);
    }
  }, [
    isCreate,
    buildPayload,
    dataProvider,
    id,
    notify,
    router,
    handleApiError,
  ]);

  // Single-click status flips — common operational gestures (drain,
  // re-activate, mark down).  Persist immediately rather than
  // requiring the user to also click Save: this is the only field
  // that should react that way because it's the one that operators
  // change *during* incidents.
  const handleStatusFlip = useCallback(
    async (next: NonNullable<Pop["status"]>) => {
      if (isCreate) {
        // In create mode there's nothing to flip yet — just update
        // the form state.
        handleChange("status", next);
        return;
      }
      setSaving(true);
      try {
        await dataProvider.update("pops", id, { status: next });
        notify(`Status set to ${next}`, { type: "success" });
        await mutate();
        handleChange("status", next);
      } catch (err) {
        handleApiError(err, "Failed to update status");
      } finally {
        setSaving(false);
      }
    },
    [
      isCreate,
      dataProvider,
      id,
      notify,
      mutate,
      handleChange,
      handleApiError,
    ],
  );

  const handleDelete = useCallback(
    async (force = false) => {
      setDeleting(true);
      try {
        // Pass `force=true` as a query param — matches what the Lua
        // wrapper reads via ngx.req.get_uri_args().  The dataProvider
        // doesn't currently expose a clean per-resource hook for
        // delete query params, so we fall through to a direct fetch.
        await dataProvider.remove("pops", id + (force ? "?force=true" : ""));
        notify(force ? "POP force-deleted" : "POP deleted", {
          type: "success",
        });
        router.push("/pops" as Route);
      } catch (err) {
        const errObj = err as {
          message?: string;
          status?: number;
          details?: { referencing_servers?: ReferencingServer[] };
        };
        const refs = errObj?.details;
        if (errObj?.status === 409 && refs?.referencing_servers) {
          // First click: surface the conflict in the dialog so the
          // user can review the servers and decide whether to force.
          setReferencingServers(refs.referencing_servers);
          notify(
            errObj.message ||
              "POP is in use; review and confirm cascade-detach",
            { type: "info" },
          );
        } else {
          handleApiError(err, "Failed to delete POP");
          setShowDelete(false);
        }
      } finally {
        setDeleting(false);
      }
    },
    [dataProvider, id, notify, router, handleApiError],
  );

  // Reset the delete-dialog state whenever the dialog is opened or
  // closed so a stale `referencingServers` from a previous attempt
  // doesn't bleed through.
  const openDeleteDialog = useCallback(() => {
    setReferencingServers(null);
    setShowDelete(true);
  }, []);
  const closeDeleteDialog = useCallback(() => {
    setReferencingServers(null);
    setShowDelete(false);
  }, []);

  // ── Loading / error states for edit-mode hydration ───────────────
  if (!isCreate && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" />
      </div>
    );
  }
  if (!isCreate && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
  }

  const currentStatus = (form.status || "active") as NonNullable<Pop["status"]>;

  return (
    <div>
      <PageHeader
        title={isCreate ? "Create POP" : `POP: ${data?.display_name ?? id}`}
        subtitle={
          isCreate
            ? "A new Point of Presence — a physical edge location running wslproxy."
            : "Edit POP configuration.  Status changes apply immediately."
        }
        icon={Globe2}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/pops" as Route)}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            {!isCreate && (
              <Button
                variant="danger"
                onClick={openDeleteDialog}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              loading={saving}
              icon={<Save className="h-4 w-4" />}
            >
              {isCreate ? "Create POP" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {/* Quick-action row for edit-mode: one-click drain / activate.
          Hidden on create because there's nothing to flip yet. */}
      {!isCreate && (
        <Card className="mb-4">
          <Card.Body>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Current status:
                </span>
                <Badge
                  variant={
                    currentStatus === "active"
                      ? "success"
                      : currentStatus === "draining"
                        ? "warning"
                        : currentStatus === "down"
                          ? "danger"
                          : "info"
                  }
                >
                  {currentStatus}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentStatus !== "active" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleStatusFlip("active")}
                    loading={saving}
                    icon={<Power className="h-4 w-4" />}
                  >
                    Activate
                  </Button>
                )}
                {currentStatus === "active" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleStatusFlip("draining")}
                    loading={saving}
                    icon={<PowerOff className="h-4 w-4" />}
                  >
                    Drain
                  </Button>
                )}
                {currentStatus !== "maintenance" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStatusFlip("maintenance")}
                    loading={saving}
                  >
                    Mark Maintenance
                  </Button>
                )}
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Configuration
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="ID (slug)"
              value={form.id}
              onChange={(e) => handleChange("id", e.target.value)}
              disabled={!isCreate}
              hint={
                isCreate
                  ? "Lowercase alphanumeric + dashes, 2-32 chars (e.g. pop0, lon1, us-east-1).  Immutable after creation."
                  : "POP id is immutable — delete and recreate under a new id if needed."
              }
              error={fieldErrors.id}
              placeholder="pop0"
            />
            <Input
              label="Display Name"
              value={form.display_name}
              onChange={(e) => handleChange("display_name", e.target.value)}
              hint="Human-friendly name shown in dashboards."
              error={fieldErrors.display_name}
              placeholder="London POP 0"
            />
            <Input
              label="Public IPv4"
              value={form.public_ipv4}
              onChange={(e) => handleChange("public_ipv4", e.target.value)}
              hint="The IP DNS records will point at for traffic to reach this POP."
              error={fieldErrors.public_ipv4}
              placeholder="85.190.106.189"
            />
            <Input
              label="Public IPv6 (optional)"
              value={form.public_ipv6}
              onChange={(e) => handleChange("public_ipv6", e.target.value)}
              error={fieldErrors.public_ipv6}
              placeholder="2a01:4f8:..."
            />
            <Input
              label="Region"
              value={form.region}
              onChange={(e) => handleChange("region", e.target.value)}
              hint="Free-form region tag (e.g. eu-west, us-east, apac)."
              error={fieldErrors.region}
              placeholder="eu-west"
            />
            <Input
              label="Country Code (ISO 3166-1 alpha-2)"
              value={form.country_code}
              onChange={(e) =>
                handleChange("country_code", e.target.value.toUpperCase())
              }
              hint="Two-letter uppercase (GB, US, DE, SG…)."
              error={fieldErrors.country_code}
              placeholder="GB"
              maxLength={2}
            />
            <Input
              label="City"
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              error={fieldErrors.city}
              placeholder="London"
            />
            <Input
              label="Internal Hostname"
              value={form.internal_hostname}
              onChange={(e) =>
                handleChange("internal_hostname", e.target.value)
              }
              hint="Control-plane DNS name for this POP (used internally — not customer-facing)."
              error={fieldErrors.internal_hostname}
              placeholder="lon1.pop0.uk"
            />
            <Input
              label="Latitude (optional)"
              value={form.lat}
              onChange={(e) => handleChange("lat", e.target.value)}
              hint="-90 to 90.  Used for geo-distance calculations in routing strategies."
              error={fieldErrors.lat}
              type="number"
              step="0.0001"
              placeholder="51.5074"
            />
            <Input
              label="Longitude (optional)"
              value={form.lng}
              onChange={(e) => handleChange("lng", e.target.value)}
              hint="-180 to 180."
              error={fieldErrors.lng}
              type="number"
              step="0.0001"
              placeholder="-0.1278"
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => handleChange("status", e.target.value)}
              options={STATUS_OPTIONS}
              error={fieldErrors.status}
            />
            <Input
              label="Capacity Weight"
              value={form.capacity_weight}
              onChange={(e) => handleChange("capacity_weight", e.target.value)}
              hint="0.0–1.0.  Multiplier for traffic share in weighted DNS pools.  Set 0 to drain via routing without flipping status."
              error={fieldErrors.capacity_weight}
              type="number"
              step="0.05"
              min="0"
              max="1"
            />
            <Input
              label="Provider"
              value={form.provider}
              onChange={(e) => handleChange("provider", e.target.value)}
              hint="Free-form datacenter / cloud provider tag."
              error={fieldErrors.provider}
              placeholder="hetzner"
            />
            <Input
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={(e) => handleChange("tags", e.target.value)}
              hint="Free-form labels — e.g. production, primary, edge."
              error={fieldErrors.tags}
              placeholder="production, primary"
            />
          </div>
        </Card.Body>
      </Card>

      <ConfirmDialog
        open={showDelete}
        title={
          referencingServers
            ? "POP is in use — force delete?"
            : `Delete POP "${data?.display_name ?? id}"?`
        }
        message={
          referencingServers ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                  This POP is referenced by{" "}
                  <strong>{referencingServers.length}</strong> server
                  {referencingServers.length === 1 ? "" : "s"}.  Forcing
                  delete will strip the reference from each of them.
                </div>
              </div>
              <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                {referencingServers.map((s) => (
                  <li
                    key={s.server_id}
                    className="font-mono text-xs text-slate-700 dark:text-slate-300"
                  >
                    {s.server_name ?? s.server_id}{" "}
                    <span className="text-slate-400">({s.profile_id})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            "This action cannot be undone."
          )
        }
        confirmLabel={
          referencingServers ? "Force-delete + detach" : "Delete"
        }
        confirmVariant="danger"
        loading={deleting}
        onConfirm={() => handleDelete(Boolean(referencingServers))}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}

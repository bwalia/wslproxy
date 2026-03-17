"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitPullRequest, Eye, Check, X } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import Dialog from "@/components/ui/Dialog";
import Input from "@/components/ui/Input";
import type { ChangeRequest } from "@/types";

type TabFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

export default function ChangeRequestsPage() {
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const [data, setData] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("all");

  // View dialog
  const [viewCR, setViewCR] = useState<ChangeRequest | null>(null);

  // Approve dialog
  const [approveCR, setApproveCR] = useState<ChangeRequest | null>(null);
  const [approveForm, setApproveForm] = useState({
    username: "",
    passphrase: "",
    comment: "",
  });
  const [approving, setApproving] = useState(false);

  // Reject dialog
  const [rejectCR, setRejectCR] = useState<ChangeRequest | null>(null);
  const [rejectForm, setRejectForm] = useState({ username: "", reason: "" });
  const [rejecting, setRejecting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dataProvider.getChangeRequests();
      setData(result.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    if (tab === "all") return data;
    return data.filter((cr) => cr.state?.toLowerCase() === tab);
  }, [data, tab]);

  const pendingCount = useMemo(
    () => data.filter((cr) => cr.state?.toLowerCase() === "pending").length,
    [data],
  );

  const columns = useMemo<Column<ChangeRequest>[]>(
    () => [
      { field: "id", label: "ID" },
      {
        field: "state",
        label: "Status",
        render: (r) => <StatusBadge status={r.state ?? "unknown"} />,
      },
      { field: "resource_name", label: "Resource" },
      { field: "change_type", label: "Type" },
      { field: "created_by", label: "Created By" },
      {
        field: "created_at",
        label: "Created At",
        render: (r) =>
          r.created_at
            ? new Date(r.created_at * 1000).toLocaleDateString()
            : "-",
      },
      {
        field: "actions",
        label: "Actions",
        render: (r) => (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setViewCR(r)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="View"
            >
              <Eye className="h-4 w-4" />
            </button>
            {r.state?.toLowerCase() === "pending" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setApproveCR(r);
                    setApproveForm({
                      username: "",
                      passphrase: "",
                      comment: "",
                    });
                  }}
                  className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  title="Approve"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectCR(r);
                    setRejectForm({ username: "", reason: "" });
                  }}
                  className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Reject"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const handleApprove = useCallback(async () => {
    if (!approveCR) return;
    setApproving(true);
    try {
      await dataProvider.approveCR(approveCR.id, approveForm);
      notify("Change request approved", { type: "success" });
      setApproveCR(null);
      fetchData();
    } catch (err) {
      notify((err as Error).message || "Failed to approve", { type: "error" });
    } finally {
      setApproving(false);
    }
  }, [approveCR, approveForm, dataProvider, notify, fetchData]);

  const handleReject = useCallback(async () => {
    if (!rejectCR) return;
    setRejecting(true);
    try {
      await dataProvider.rejectCR(rejectCR.id, rejectForm);
      notify("Change request rejected", { type: "success" });
      setRejectCR(null);
      fetchData();
    } catch (err) {
      notify((err as Error).message || "Failed to reject", { type: "error" });
    } finally {
      setRejecting(false);
    }
  }, [rejectCR, rejectForm, dataProvider, notify, fetchData]);

  const tabs: { key: TabFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div>
      <PageHeader title="Change Requests" icon={GitPullRequest} />

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Total</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {data.length}
          </p>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        total={filteredData.length}
        loading={loading}
      />

      {/* View dialog */}
      <Dialog
        open={!!viewCR}
        onClose={() => setViewCR(null)}
        title={`Change Request: ${viewCR?.id ?? ""}`}
      >
        {viewCR && (
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Status</dt>
              <dd>
                <StatusBadge status={viewCR.state ?? "unknown"} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Resource</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">
                {viewCR.resource_name}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Type</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">
                {viewCR.change_type}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Created By</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">
                {viewCR.created_by}
              </dd>
            </div>
            {viewCR.description && (
              <div>
                <dt className="text-sm text-slate-500">Description</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {viewCR.description}
                </dd>
              </div>
            )}
          </dl>
        )}
      </Dialog>

      {/* Approve dialog */}
      <Dialog
        open={!!approveCR}
        onClose={() => setApproveCR(null)}
        title="Approve Change Request"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setApproveCR(null)}
              disabled={approving}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} loading={approving}>
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Username"
            value={approveForm.username}
            onChange={(e) =>
              setApproveForm((prev) => ({ ...prev, username: e.target.value }))
            }
          />
          <Input
            label="Passphrase"
            type="password"
            value={approveForm.passphrase}
            onChange={(e) =>
              setApproveForm((prev) => ({
                ...prev,
                passphrase: e.target.value,
              }))
            }
          />
          <Input
            label="Comment"
            value={approveForm.comment}
            onChange={(e) =>
              setApproveForm((prev) => ({ ...prev, comment: e.target.value }))
            }
          />
        </div>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={!!rejectCR}
        onClose={() => setRejectCR(null)}
        title="Reject Change Request"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setRejectCR(null)}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReject} loading={rejecting}>
              Reject
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Username"
            value={rejectForm.username}
            onChange={(e) =>
              setRejectForm((prev) => ({ ...prev, username: e.target.value }))
            }
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Reason
            </label>
            <textarea
              value={rejectForm.reason}
              onChange={(e) =>
                setRejectForm((prev) => ({ ...prev, reason: e.target.value }))
              }
              rows={3}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

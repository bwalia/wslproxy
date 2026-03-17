"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Plus, X, KeyRound } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import type { Secret } from "@/types";

export default function SecretDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading } = useOne<Secret>(
    isCreate ? null : "secrets",
    isCreate ? null : id,
  );

  const [secretName, setSecretName] = useState("");
  const [secrets, setSecrets] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setSecretName(data.secret_name ?? "");
      setSecrets(data.secrets ?? []);
    }
  }, [data]);

  const handleAddPair = useCallback(() => {
    setSecrets((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const handleRemovePair = useCallback((index: number) => {
    setSecrets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePairChange = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      setSecrets((prev) =>
        prev.map((pair, i) => (i === index ? { ...pair, [field]: val } : pair)),
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { secret_name: secretName, secrets };
      if (isCreate) {
        await dataProvider.create("secrets", payload);
        notify("Secret created successfully", { type: "success" });
      } else {
        await dataProvider.update("secrets", id, payload);
        notify("Secret updated successfully", { type: "success" });
      }
      router.push("/secrets");
    } catch (err) {
      notify((err as Error).message || "Failed to save secret", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, secretName, secrets, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("secrets", id);
      notify("Secret deleted successfully", { type: "success" });
      router.push("/secrets");
    } catch (err) {
      notify((err as Error).message || "Failed to delete secret", {
        type: "error",
      });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }, [id, dataProvider, notify, router]);

  if (!isCreate && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          isCreate ? "Create Secret" : `Secret: ${data?.secret_name ?? id}`
        }
        icon={KeyRound}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/secrets")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Secret Details
          </h2>
        </Card.Header>
        <Card.Body>
          <Input
            label="Secret Name"
            value={secretName}
            onChange={(e) => setSecretName(e.target.value)}
          />
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Key-Value Pairs
          </h2>
          <Button
            size="sm"
            onClick={handleAddPair}
            icon={<Plus className="h-4 w-4" />}
          >
            Add
          </Button>
        </Card.Header>
        <Card.Body>
          {secrets.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No key-value pairs. Click &quot;Add&quot; to create one.
            </p>
          ) : (
            <div className="space-y-3">
              {secrets.map((pair, idx) => (
                <div key={idx} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      label={idx === 0 ? "Key" : undefined}
                      placeholder="Key"
                      value={pair.key}
                      onChange={(e) =>
                        handlePairChange(idx, "key", e.target.value)
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label={idx === 0 ? "Value" : undefined}
                      placeholder="Value"
                      type="password"
                      value={pair.value}
                      onChange={(e) =>
                        handlePairChange(idx, "value", e.target.value)
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePair(idx)}
                    className="mb-0.5 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card.Body>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <div>
          {!isCreate && (
            <Button
              variant="danger"
              onClick={() => setShowDelete(true)}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete
            </Button>
          )}
        </div>
        <Button
          onClick={handleSubmit}
          loading={saving}
          icon={<Save className="h-4 w-4" />}
        >
          {isCreate ? "Create" : "Save Changes"}
        </Button>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Secret"
        message={`Are you sure you want to delete "${data?.secret_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}

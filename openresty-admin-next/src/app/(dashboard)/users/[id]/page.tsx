"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Users } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import type { User } from "@/types";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<User>(
    isCreate ? null : "users",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    user_role: "user",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        email: data.email ?? "",
        password: "",
        phone: data.phone ?? "",
        user_role: data.user_role ?? "user",
      });
    }
  }, [data]);

  const handleChange = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (!payload.password) delete payload.password;
      if (isCreate) {
        await dataProvider.create("users", payload);
        notify("User created successfully", { type: "success" });
      } else {
        await dataProvider.update("users", id, payload);
        notify("User updated successfully", { type: "success" });
      }
      router.push("/users");
    } catch (err) {
      notify((err as Error).message || "Failed to save user", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("users", id);
      notify("User deleted successfully", { type: "success" });
      router.push("/users");
    } catch (err) {
      notify((err as Error).message || "Failed to delete user", {
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

  if (!isCreate && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
  }

  return (
    <div>
      <PageHeader
        title={isCreate ? "Create User" : `User: ${data?.name ?? id}`}
        icon={Users}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/users")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            User Details
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
            <Input
              label={
                isCreate ? "Password" : "Password (leave blank to keep current)"
              }
              type="password"
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
            <Select
              label="Role"
              value={form.user_role}
              onChange={(e) => handleChange("user_role", e.target.value)}
              options={[
                { value: "user", label: "User" },
                { value: "admin", label: "Admin" },
              ]}
            />
          </div>
        </Card.Body>
      </Card>

      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
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
        title="Delete User"
        message={`Are you sure you want to delete "${data?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}

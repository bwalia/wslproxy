"use client";

import React from "react";
import Dialog from "./Dialog";
import Button from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  /** String for simple confirmations; ReactNode when the caller needs
   *  rich content (e.g. a list of affected items, an inline warning
   *  card).  When a non-string is passed we render it inside a <div>
   *  instead of <p> so block-level children don't generate invalid
   *  HTML — see pops/[id]/page.tsx's force-delete dialog. */
  message?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger" | "secondary" | "ghost";
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  title = "Confirm",
  message = "Are you sure you want to proceed?",
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  loading = false,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === "string" ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      ) : (
        // ReactNode messages may contain block-level children (divs,
        // lists, etc.) which are invalid inside a <p>; wrap in <div>.
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {message}
        </div>
      )}
    </Dialog>
  );
};

ConfirmDialog.displayName = "ConfirmDialog";

export default ConfirmDialog;

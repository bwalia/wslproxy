/* ──────────────────────────────────────────────────────────────────────────
   Surface backend (server-side) validation errors onto a
   react-hook-form `useForm` instance so individual fields turn red
   with the message instead of the user only seeing a top-level toast.

   The Lua backend currently emits errors as
       { error: { message, status, code, details? } }
   Where `details` may be:
       a) a `Record<string, string>` — explicit field map; or
       b) an `Array<{ field, message }>` — per-issue list; or
       c) absent entirely (single-message error).

   We normalise all three forms into per-field setError calls.  When
   `details` is absent we apply the message to the optional `fallback`
   field if the caller knows which field the message refers to (e.g.
   the form has only one likely target — server_name on a 409
   "already exists").
   ────────────────────────────────────────────────────────────────────────── */

import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

interface FieldDetail {
  field?: string;
  path?: string;
  message?: string;
}

/**
 * Apply backend-side validation errors to a react-hook-form setError.
 *
 * Returns `true` if at least one per-field error was applied (so the
 * caller can decide whether to suppress the generic toast).
 */
export function surfaceServerErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  error: unknown,
  fallbackField?: Path<TValues>,
): boolean {
  if (!error || typeof error !== "object") return false;

  // ApiError carries a `details` payload from the backend envelope.
  // Other shapes (raw fetch errors, framework errors) won't.
  const details = (error as { details?: unknown }).details;
  const message = (error as { message?: string }).message ?? "";

  let applied = 0;

  if (details && typeof details === "object") {
    if (Array.isArray(details)) {
      // Shape (b): list of `{field, message}` entries.
      for (const entry of details as FieldDetail[]) {
        const path = entry?.field ?? entry?.path;
        if (path && entry?.message) {
          setError(path as Path<TValues>, {
            type: "server",
            message: entry.message,
          });
          applied++;
        }
      }
    } else {
      // Shape (a): map keyed by field path.
      for (const [path, value] of Object.entries(
        details as Record<string, unknown>,
      )) {
        const msg = typeof value === "string"
          ? value
          : typeof (value as { message?: string })?.message === "string"
            ? (value as { message: string }).message
            : null;
        if (msg) {
          setError(path as Path<TValues>, { type: "server", message: msg });
          applied++;
        }
      }
    }
  }

  // Shape (c): no `details` map — surface the single message on the
  // fallback field if the caller named one, or as a top-level form
  // error otherwise.  RHF treats `_form` as a non-field error key.
  if (applied === 0 && message) {
    const target = fallbackField ?? ("_form" as Path<TValues>);
    setError(target, { type: "server", message });
    applied++;
  }

  return applied > 0;
}

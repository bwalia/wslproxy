/**
 * Submit-time validation gate for forms that aren't using react-hook-form.
 *
 * Large forms that already manage state with `useState` can get the
 * same Zod-backed validation as the `useZodForm` pipeline by calling
 * `runValidationGate(schema, formState)` at the start of `handleSubmit`.
 *
 * Why a separate surface:
 *  - `useZodForm` drives the input components (register, Controller,
 *    FormProvider).  Retrofitting that onto a 1500-line multi-tab form
 *    is high-risk churn for zero user-visible improvement — the inputs
 *    already work.
 *  - What users actually care about is "tell me what's wrong before
 *    you POST garbage to the backend".  That's what this gate provides.
 *
 * The schema output is narrower than the form state (inputs may hold
 * extra fields not relevant to validation), so callers continue using
 * their existing `buildPayload(form)` path; they just `return` early
 * when the gate reports failures.
 */

import type { ZodTypeAny, z } from "zod";

export interface ValidationGateResult<T> {
  ok: boolean;
  /** Parsed + coerced data when `ok` is true; undefined otherwise. */
  data?: T;
  /** Dotted-path → human message.  Empty when `ok` is true. */
  fieldErrors: Record<string, string>;
  /** Convenience shortcut — first error in schema declaration order. */
  firstError?: { field: string; message: string };
}

/**
 * Run `schema.safeParse(input)` and massage Zod's issue list into a
 * flat dotted-path → message map.  Nested fields become "listens.0.listen"
 * or "rate_limit.requests_per_second" — callers then match these paths
 * against their field-to-tab map.
 */
export function runValidationGate<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
): ValidationGateResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data, fieldErrors: {} };
  }
  const fieldErrors: Record<string, string> = {};
  let firstError: { field: string; message: string } | undefined;
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "_form";
    // Keep the first error for each field — duplicates are noisy and
    // usually redundant (same underlying violation).
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
      if (!firstError) firstError = { field, message: issue.message };
    }
  }
  return { ok: false, fieldErrors, firstError };
}

/**
 * Map a dotted field path to the form tab it belongs to.
 *
 * Pass the map when calling `findTabForError` — the first path prefix
 * that matches wins, so list specific paths before prefixes (e.g.
 * `"rate_limit.requests_per_second"` before `"rate_limit"`).
 */
export function findTabForError<Tab extends string>(
  fieldPath: string,
  map: Array<{ prefix: string; tab: Tab }>,
  fallback: Tab,
): Tab {
  for (const entry of map) {
    if (fieldPath === entry.prefix || fieldPath.startsWith(entry.prefix + ".")) {
      return entry.tab;
    }
  }
  return fallback;
}

/* ──────────────────────────────────────────────────────────────────────────
   Runtime validation wrapper.

   `validate<T>(schema, data)` — parse a fetched payload against a Zod
   schema.  Returns the parsed value on success; throws `ValidationError`
   on schema failure.  The error message is intentionally short — the
   full Zod issue list is attached on `.issues` so error UIs can render
   a human-readable breakdown.

   In development mode we log the failing payload so the mismatch is
   easy to diagnose.  In production we stay silent to avoid leaking
   response bodies into logs.
   ────────────────────────────────────────────────────────────────────────── */

import type { z } from "zod";

export class ValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];
  readonly path: string;

  constructor(
    message: string,
    issues: z.core.$ZodIssue[],
    path: string,
  ) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
    this.path = path;
  }
}

export interface ValidateOptions {
  /** Short label used in error messages + dev logs. */
  path?: string;
  /** If true, non-conformant payloads log+pass through instead of throwing.
   *  Useful during migration when we'd rather tolerate mild backend drift. */
  tolerant?: boolean;
}

/**
 * Validate a value against a Zod schema.
 *
 * @throws ValidationError if the schema fails and `tolerant` is false.
 */
export function validate<Schema extends z.ZodTypeAny>(
  schema: Schema,
  data: unknown,
  options: ValidateOptions = {},
): z.infer<Schema> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const path = options.path ?? "<response>";
  const summary = result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
  const message = `Invalid ${path}: ${summary}`;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[validate] ${message}`, {
      issues: result.error.issues,
      data,
    });
  }

  if (options.tolerant) {
    return data as z.infer<Schema>;
  }
  throw new ValidationError(message, result.error.issues, path);
}

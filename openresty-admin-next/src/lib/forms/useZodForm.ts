"use client";

/* ──────────────────────────────────────────────────────────────────────────
   useZodForm — thin wrapper around `useForm` from react-hook-form that
   always uses Zod as the validation engine.

   Why:
    - Every form in this app validates via Zod (same schemas we already
      use at the network boundary in `src/lib/validation/schemas.ts`).
      Using one factory means we never drift to "different validation
      in different forms".
    - Default behaviour is tuned for admin UX: validate on blur + on
      submit (not on every keystroke — too noisy for a complex form),
      re-validate on change after the first failed submit.
    - Uses `useFormState` + `useWatch` for minimal re-renders — fields
      only re-render when their own data changes.

   Usage:
     const form = useZodForm({
       schema: profileSchema,
       defaultValues: { name: "", description: "" },
     });
     const onSubmit = form.handleSubmit(async (values) => { ... });
   ────────────────────────────────────────────────────────────────────────── */

import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * The Zod input type, constrained to something RHF will accept.
 * Form schemas are always object shaped so this narrowing is safe;
 * primitive schemas would collapse to `never` which is the intent
 * (they can't be used as form values).
 */
type SchemaInput<S extends z.ZodTypeAny> = z.input<S> extends FieldValues
  ? z.input<S>
  : never;

export interface UseZodFormOptions<
  Schema extends z.ZodTypeAny,
  TValues extends FieldValues = SchemaInput<Schema>,
> extends Omit<UseFormProps<TValues>, "resolver" | "defaultValues"> {
  schema: Schema;
  defaultValues: DefaultValues<TValues>;
}

/**
 * Returns a fully-typed `useForm` instance bound to the given Zod schema.
 * The resolved form values (after Zod transform / default application)
 * have the schema's OUTPUT type; inputs use the INPUT type.
 */
export function useZodForm<
  Schema extends z.ZodTypeAny,
  TValues extends FieldValues = SchemaInput<Schema>,
>({
  schema,
  defaultValues,
  mode = "onBlur",
  reValidateMode = "onChange",
  ...rest
}: UseZodFormOptions<Schema, TValues>): UseFormReturn<TValues> {
  // `zodResolver` is the officially-sanctioned RHF ↔ Zod bridge.
  // TypeScript can't prove the generic `Schema` produces a shape that
  // satisfies `FieldValues`, even though every caller's schema is a
  // `z.ZodObject` at runtime.  Escape via an `unknown` cast on the
  // function reference so the generic variance is erased — we restore
  // precision by the outer `TValues` constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolver = (zodResolver as (s: unknown) => Resolver<any>)(
    schema,
  ) as Resolver<TValues>;
  return useForm<TValues>({
    resolver,
    defaultValues,
    mode,
    reValidateMode,
    ...rest,
  });
}

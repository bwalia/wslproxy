"use client";

import { useFormContext, type FieldValues, type Path } from "react-hook-form";

/**
 * Headless field wrapper — exposes `{ value, onChange, onBlur, error }`
 * to a render prop so you can plug in any non-trivial input (e.g. a
 * chip picker, a code editor, a drag-drop list) while still getting
 * the Zod validation + error plumbing for free.
 *
 * For simple inputs use `<FormInput>`, `<FormTextarea>`, `<FormSelect>`
 * instead — they wrap this pattern for you.
 */

import { Controller, type Control, type ControllerRenderProps } from "react-hook-form";

export interface FormFieldProps<
  TValues extends FieldValues,
  TName extends Path<TValues>,
> {
  /** Form control — either passed in explicitly or pulled from context. */
  control?: Control<TValues>;
  name: TName;
  /**
   * Render function receives the field state + the flattened error
   * message (if any).  Use this when the stock Input/Select/Textarea
   * components aren't a good fit.
   */
  children: (args: {
    field: ControllerRenderProps<TValues, TName>;
    error: string | undefined;
    invalid: boolean;
  }) => React.ReactElement;
}

export default function FormField<
  TValues extends FieldValues,
  TName extends Path<TValues>,
>({ control, name, children }: FormFieldProps<TValues, TName>) {
  // If no control prop, pull from surrounding FormProvider context.
  const ctx = useFormContext<TValues>();
  const effectiveControl = control ?? ctx?.control;

  return (
    <Controller
      control={effectiveControl}
      name={name}
      render={({ field, fieldState }) =>
        children({
          field,
          error: fieldState.error?.message,
          invalid: Boolean(fieldState.error),
        })
      }
    />
  );
}

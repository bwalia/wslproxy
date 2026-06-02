"use client";

import { forwardRef } from "react";
import {
  type FieldValues,
  type Path,
  type UseFormRegister,
  useFormContext,
} from "react-hook-form";
import Input, { type InputProps } from "@/components/ui/Input";

/**
 * Form-connected Input.  Registers the field with react-hook-form via
 * `register()` (uncontrolled → minimal re-renders) and automatically
 * renders the Zod validation error message below the field.
 *
 * Pass either `register` explicitly or rely on `useFormContext` when
 * the form is wrapped in a `<FormProvider>`.
 */

export interface FormInputProps<TValues extends FieldValues>
  extends Omit<InputProps, "name" | "error"> {
  name: Path<TValues>;
  register?: UseFormRegister<TValues>;
  /** Zod error message for this field.  When omitted, pulled from context. */
  error?: string;
}

function FormInputInner<TValues extends FieldValues>(
  {
    name,
    register: registerProp,
    error: errorProp,
    ...rest
  }: FormInputProps<TValues>,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const ctx = useFormContext<TValues>();
  const register = registerProp ?? ctx?.register;
  const fieldError =
    errorProp ?? (ctx?.formState.errors[name]?.message as string | undefined);

  if (!register) {
    // Render in read-only mode if there's no register — lets the
    // component be used outside a FormProvider without crashing.
    return <Input ref={ref} name={name} error={fieldError} {...rest} />;
  }

  const { ref: registerRef, ...registration } = register(name);

  const composedRef = (node: HTMLInputElement | null) => {
    registerRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <Input
      ref={composedRef}
      error={fieldError}
      {...registration}
      {...rest}
    />
  );
}

const FormInput = forwardRef(FormInputInner) as <TValues extends FieldValues>(
  props: FormInputProps<TValues> & { ref?: React.Ref<HTMLInputElement> },
) => React.ReactElement;

export default FormInput;

"use client";

import { forwardRef } from "react";
import {
  type FieldValues,
  type Path,
  type UseFormRegister,
  useFormContext,
} from "react-hook-form";
import Select, { type SelectProps } from "@/components/ui/Select";

export interface FormSelectProps<TValues extends FieldValues>
  extends Omit<SelectProps, "name" | "error"> {
  name: Path<TValues>;
  register?: UseFormRegister<TValues>;
  error?: string;
}

function FormSelectInner<TValues extends FieldValues>(
  { name, register: registerProp, error: errorProp, ...rest }: FormSelectProps<TValues>,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  const ctx = useFormContext<TValues>();
  const register = registerProp ?? ctx?.register;
  const fieldError =
    errorProp ?? (ctx?.formState.errors[name]?.message as string | undefined);

  if (!register) {
    return <Select ref={ref} name={name} error={fieldError} {...rest} />;
  }

  const { ref: registerRef, ...registration } = register(name);
  const composedRef = (node: HTMLSelectElement | null) => {
    registerRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <Select ref={composedRef} error={fieldError} {...registration} {...rest} />
  );
}

const FormSelect = forwardRef(FormSelectInner) as <TValues extends FieldValues>(
  props: FormSelectProps<TValues> & { ref?: React.Ref<HTMLSelectElement> },
) => React.ReactElement;

export default FormSelect;

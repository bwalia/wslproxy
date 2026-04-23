"use client";

import { forwardRef } from "react";
import {
  type FieldValues,
  type Path,
  type UseFormRegister,
  useFormContext,
} from "react-hook-form";
import Textarea, { type TextareaProps } from "@/components/ui/Textarea";

export interface FormTextareaProps<TValues extends FieldValues>
  extends Omit<TextareaProps, "name" | "error"> {
  name: Path<TValues>;
  register?: UseFormRegister<TValues>;
  error?: string;
}

function FormTextareaInner<TValues extends FieldValues>(
  { name, register: registerProp, error: errorProp, ...rest }: FormTextareaProps<TValues>,
  ref: React.ForwardedRef<HTMLTextAreaElement>,
) {
  const ctx = useFormContext<TValues>();
  const register = registerProp ?? ctx?.register;
  const fieldError =
    errorProp ?? (ctx?.formState.errors[name]?.message as string | undefined);

  if (!register) {
    return <Textarea ref={ref} name={name} error={fieldError} {...rest} />;
  }

  const { ref: registerRef, ...registration } = register(name);
  const composedRef = (node: HTMLTextAreaElement | null) => {
    registerRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <Textarea ref={composedRef} error={fieldError} {...registration} {...rest} />
  );
}

const FormTextarea = forwardRef(FormTextareaInner) as <TValues extends FieldValues>(
  props: FormTextareaProps<TValues> & { ref?: React.Ref<HTMLTextAreaElement> },
) => React.ReactElement;

export default FormTextarea;

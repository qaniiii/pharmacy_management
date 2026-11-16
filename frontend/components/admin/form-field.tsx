import type { ReactNode } from "react";

export const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const LABEL_CLASS = "block text-xs font-medium text-slate-700";

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  defaultValue,
  autoComplete,
  error,
  hint,
  maxLength,
  minLength,
  min,
  step,
  className = "",
}: {
  id: string;
  label: string;
  /** Field name in the submitted FormData. Never derive this from `id`. */
  name: string;
  type?: "text" | "email" | "tel" | "password" | "date" | "number";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  autoComplete?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  step?: number | string;
  className?: string;
}) {
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={hint}
      className={className}
    >
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        maxLength={maxLength}
        minLength={minLength}
        min={min}
        step={step}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

export function TextAreaField({
  id,
  label,
  name,
  required = false,
  rows = 3,
  placeholder,
  defaultValue,
  error,
  hint,
  maxLength,
  className = "",
}: {
  id: string;
  label: string;
  /** Field name in the submitted FormData. Never derive this from `id`. */
  name: string;
  required?: boolean;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={hint}
      className={className}
    >
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
    >
      {message}
    </p>
  );
}

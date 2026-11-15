"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  label,
  pendingLabel,
  variant = "dark",
  className = "",
  ariaLabel,
}: {
  label: string;
  pendingLabel: string;
  variant?: "dark" | "light";
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  const base =
    variant === "dark"
      ? "inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
      : "inline-flex items-center justify-center rounded-lg border bg-white px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      className={`${base} ${className}`.trim()}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

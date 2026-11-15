"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/admin/submit-button";
import {
  INITIAL_ADMIN_FORM_STATE,
  type AdminFormState,
} from "@/lib/admin/form-state";

/**
 * Small activate/deactivate form used by the tenant and user tables.
 *
 * `useActionState` keeps an error next to the row that caused it instead of
 * replacing the whole page with an error boundary.
 */
export function ToggleForm({
  action,
  fields,
  label,
  pendingLabel,
  tone,
  confirmMessage,
  srDescription,
}: {
  action: (
    state: AdminFormState,
    formData: FormData,
  ) => Promise<AdminFormState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  tone: "danger" | "success";
  confirmMessage?: string;
  srDescription?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ADMIN_FORM_STATE);

  const toneClass =
    tone === "danger"
      ? "border-rose-200 text-rose-700 hover:bg-rose-50"
      : "border-emerald-200 text-emerald-700 hover:bg-emerald-50";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <SubmitButton
        label={label}
        pendingLabel={pendingLabel}
        variant="light"
        className={toneClass}
        ariaLabel={srDescription}
      />

      {state.status === "error" && state.message ? (
        <p role="alert" className="max-w-48 text-right text-xs text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

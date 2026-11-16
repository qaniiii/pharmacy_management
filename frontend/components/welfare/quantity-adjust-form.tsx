"use client";

import { useActionState } from "react";

import { adjustInventoryQuantityAction } from "@/app/welfare/actions";
import {
  INITIAL_WELFARE_FORM_STATE,
  type WelfareFormState,
} from "@/lib/welfare/form-state";

const INPUT_CLASS =
  "w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50";

const BUTTON_CLASS =
  "rounded-lg border px-2 py-1 text-[0.7rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60";

export function QuantityAdjustForm({
  itemId,
  label,
}: {
  itemId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<
    WelfareFormState,
    FormData
  >(adjustInventoryQuantityAction, INITIAL_WELFARE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="item_id" value={itemId} />
      <div className="flex items-center gap-1">
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="Qty"
          aria-label={`Amount to adjust for ${label}`}
          className={INPUT_CLASS}
        />
        <button
          type="submit"
          name="mode"
          value="dispense"
          disabled={pending}
          className={`${BUTTON_CLASS} border-rose-200 text-rose-700 hover:bg-rose-50`}
          aria-label={`Dispense from ${label}`}
        >
          Dispense
        </button>
        <button
          type="submit"
          name="mode"
          value="restock"
          disabled={pending}
          className={`${BUTTON_CLASS} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}
          aria-label={`Restock ${label}`}
        >
          Restock
        </button>
      </div>
      {state.status === "error" && state.message ? (
        <p role="alert" className="max-w-64 text-right text-xs text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

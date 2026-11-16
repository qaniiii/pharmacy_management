"use client";

import { useActionState, useState } from "react";

import {
  createInventoryItemAction,
  updateInventoryItemAction,
} from "@/app/welfare/actions";
import {
  Field,
  FormError,
  INPUT_CLASS,
  TextAreaField,
  TextField,
} from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { Modal } from "@/components/welfare/modal";
import type { ResidentRow } from "@/lib/types/database";
import {
  INITIAL_WELFARE_FORM_STATE,
  type WelfareFormState,
} from "@/lib/welfare/form-state";

function InventoryForm({
  mode,
  item,
  residents,
  idPrefix,
}: {
  mode: "create" | "edit";
  item?: {
    id: string;
    resident_id: string | null;
    medication_name: string;
    generic_name: string | null;
    strength: string | null;
    dosage_form: string | null;
    unit: string;
    quantity_on_hand: number;
    reorder_level: number;
    batch_number: string | null;
    expiry_date: string | null;
    storage_location: string | null;
    notes: string | null;
  };
  residents: ResidentRow[];
  idPrefix: string;
}) {
  const action =
    mode === "create" ? createInventoryItemAction : updateInventoryItemAction;
  const [state, formAction] = useActionState<WelfareFormState, FormData>(
    action,
    INITIAL_WELFARE_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" ? (
        <input type="hidden" name="item_id" value={item?.id ?? ""} />
      ) : null}

      <FormError
        message={state.status === "error" ? state.message : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-resident`}
          label="Stock allocation"
          error={errors.resident_id}
          hint="Leave blank for general pooled facility stock."
          className="sm:col-span-2"
        >
          <select
            id={`${idPrefix}-resident`}
            name="resident_id"
            defaultValue={item?.resident_id ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">General pooled stock (no resident)</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.full_name}
                {resident.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </Field>

        <TextField
          id={`${idPrefix}-medication`}
          name="medication_name"
          label="Medication name"
          required
          maxLength={160}
          placeholder="Amoxicillin"
          defaultValue={item?.medication_name}
          error={errors.medication_name}
          className="sm:col-span-2"
        />

        <TextField
          id={`${idPrefix}-generic`}
          name="generic_name"
          label="Generic name"
          maxLength={160}
          defaultValue={item?.generic_name ?? ""}
          error={errors.generic_name}
        />

        <TextField
          id={`${idPrefix}-strength`}
          name="strength"
          label="Strength"
          maxLength={80}
          placeholder="500 mg"
          defaultValue={item?.strength ?? ""}
          error={errors.strength}
        />

        <TextField
          id={`${idPrefix}-form`}
          name="dosage_form"
          label="Dosage form"
          maxLength={80}
          placeholder="Capsule"
          defaultValue={item?.dosage_form ?? ""}
          error={errors.dosage_form}
        />

        <TextField
          id={`${idPrefix}-unit`}
          name="unit"
          label="Unit"
          required
          maxLength={40}
          placeholder="capsule"
          defaultValue={item?.unit ?? "unit"}
          error={errors.unit}
        />

        <TextField
          id={`${idPrefix}-quantity`}
          name="quantity_on_hand"
          label="Quantity on hand"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item?.quantity_on_hand ?? 0}
          error={errors.quantity_on_hand}
        />

        <TextField
          id={`${idPrefix}-reorder`}
          name="reorder_level"
          label="Reorder level"
          type="number"
          min={0}
          step="0.01"
          defaultValue={item?.reorder_level ?? 0}
          hint="The row is highlighted when quantity is at or below this level."
          error={errors.reorder_level}
        />

        <TextField
          id={`${idPrefix}-batch`}
          name="batch_number"
          label="Batch number"
          maxLength={80}
          defaultValue={item?.batch_number ?? ""}
          error={errors.batch_number}
        />

        <TextField
          id={`${idPrefix}-expiry`}
          name="expiry_date"
          label="Expiry date"
          type="date"
          defaultValue={item?.expiry_date ?? ""}
          error={errors.expiry_date}
        />

        <TextField
          id={`${idPrefix}-location`}
          name="storage_location"
          label="Storage location"
          maxLength={120}
          placeholder="Controlled-drug cupboard, shelf B"
          defaultValue={item?.storage_location ?? ""}
          error={errors.storage_location}
          className="sm:col-span-2"
        />

        <TextAreaField
          id={`${idPrefix}-notes`}
          name="notes"
          label="Notes"
          rows={2}
          maxLength={2000}
          defaultValue={item?.notes ?? ""}
          error={errors.notes}
          className="sm:col-span-2"
        />
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton
          label={mode === "create" ? "Add stock item" : "Save changes"}
          pendingLabel={mode === "create" ? "Adding…" : "Saving…"}
        />
      </div>
    </form>
  );
}

export function InventoryEditor({
  mode,
  item,
  residents,
  triggerLabel,
  variant = "light",
}: {
  mode: "create" | "edit";
  item?: {
    id: string;
    resident_id: string | null;
    medication_name: string;
    generic_name: string | null;
    strength: string | null;
    dosage_form: string | null;
    unit: string;
    quantity_on_hand: number;
    reorder_level: number;
    batch_number: string | null;
    expiry_date: string | null;
    storage_location: string | null;
    notes: string | null;
  };
  residents: ResidentRow[];
  triggerLabel: string;
  variant?: "dark" | "light";
}) {
  const [open, setOpen] = useState(false);
  const idPrefix = item ? `inventory-${item.id}` : "inventory-new";
  const titleId = `${idPrefix}-title`;

  const triggerClass =
    variant === "dark"
      ? "inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      : "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={triggerClass}
      >
        {triggerLabel}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        title={mode === "create" ? "Add a stock item" : "Edit stock item"}
        description={
          mode === "create"
            ? "Choose a resident to file this as prescription stock, or leave it blank for the general pool."
            : "Editing the allocation moves the stock between the pooled and resident-specific views."
        }
        size="lg"
      >
        <InventoryForm
          mode={mode}
          item={item}
          residents={residents}
          idPrefix={idPrefix}
        />
      </Modal>
    </>
  );
}

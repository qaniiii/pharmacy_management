"use client";

import { useActionState, useState } from "react";

import { createOrderAction } from "@/app/welfare/actions";
import {
  Field,
  FormError,
  INPUT_CLASS,
} from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { Modal } from "@/components/welfare/modal";
import type {
  PharmacyRow,
  ResidentRow,
} from "@/lib/types/database";
import type { InventoryWithResident } from "@/lib/welfare/data";
import {
  INITIAL_WELFARE_FORM_STATE,
  type WelfareFormState,
} from "@/lib/welfare/form-state";
import { formatQuantity } from "@/lib/format";

interface OrderLineState {
  key: string;
  inventory_item_id: string;
  medication_name: string;
  strength: string;
  dosage_form: string;
  unit: string;
  quantity: string;
  unit_price: string;
  notes: string;
}

let lineSequence = 0;

function createLine(): OrderLineState {
  lineSequence += 1;
  return {
    key: `line-${lineSequence}`,
    inventory_item_id: "",
    medication_name: "",
    strength: "",
    dosage_form: "",
    unit: "unit",
    quantity: "1",
    unit_price: "0",
    notes: "",
  };
}

function CreateOrderForm({
  pharmacies,
  residents,
  inventory,
  onCancel,
}: {
  pharmacies: PharmacyRow[];
  residents: ResidentRow[];
  inventory: InventoryWithResident[];
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<WelfareFormState, FormData>(
    createOrderAction,
    INITIAL_WELFARE_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  const [pharmacyId, setPharmacyId] = useState(pharmacies[0]?.id ?? "");
  const [residentId, setResidentId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineState[]>([createLine()]);

  function updateLine(index: number, patch: Partial<OrderLineState>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function handleInventoryChange(index: number, inventoryId: string) {
    const selected = inventory.find((item) => item.id === inventoryId);
    updateLine(index, {
      inventory_item_id: inventoryId,
      ...(selected
        ? {
            medication_name: selected.medication_name,
            strength: selected.strength ?? "",
            dosage_form: selected.dosage_form ?? "",
            unit: selected.unit,
          }
        : {}),
    });
  }

  function handleResidentChange(value: string) {
    setResidentId(value);
    const resident = residents.find((row) => row.id === value);
    if (resident?.room_number && reference.trim().length === 0) {
      const room = resident.room_number.trim();
      setReference(/^room\b/i.test(room) ? room : `Room ${room}`);
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      titleId="create-order-title"
      title="New medication order"
      description="Order directly from one active pharmacy. The resident and stock links stay private to this welfare home; the pharmacy only sees the non-identifying bag reference."
      size="xl"
    >
      <form action={formAction} className="space-y-5">
        <FormError
          message={state.status === "error" ? state.message : undefined}
        />

        <input type="hidden" name="item_count" value={lines.length} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="order-pharmacy"
            label="Pharmacy"
            error={errors.pharmacy_id}
          >
            <select
              id="order-pharmacy"
              name="pharmacy_id"
              required
              value={pharmacyId}
              onChange={(event) => setPharmacyId(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                Select an active pharmacy
              </option>
              {pharmacies.map((pharmacy) => (
                <option key={pharmacy.id} value={pharmacy.id}>
                  {pharmacy.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="order-resident"
            label="Link a resident (optional)"
            error={errors.resident_id}
            hint="Visible only to welfare staff. The pharmacy cannot read this link."
          >
            <select
              id="order-resident"
              name="resident_id"
              value={residentId}
              onChange={(event) => handleResidentChange(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">No resident linked</option>
              {residents.map((resident) => (
                <option key={resident.id} value={resident.id}>
                  {resident.full_name}
                  {resident.room_number ? ` · ${resident.room_number}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="order-reference"
            label="Bag reference"
            error={errors.resident_reference}
            hint="Shown to the pharmacy. Do not enter names, dates of birth or MRNs — use a non-identifying label such as “Room 4B”."
            className="sm:col-span-2"
          >
            <input
              id="order-reference"
              name="resident_reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              placeholder="Room 4B"
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            id="order-notes"
            label="Order notes (optional)"
            error={errors.notes}
            className="sm:col-span-2"
          >
            <textarea
              id="order-notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              placeholder="Delivery instructions or a note for the pharmacist."
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Medication lines
            </h3>
            <button
              type="button"
              onClick={() => setLines((current) => [...current, createLine()])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Add line
            </button>
          </div>

          {lines.map((line, index) => {
            const prefix = `item_${index}_`;

            return (
              <div
                key={line.key}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Line {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((current) =>
                        current.filter(
                          (_, lineIndex) => lineIndex !== index,
                        ),
                      )
                    }
                    disabled={lines.length === 1}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-[0.7rem] font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    id={`order-${line.key}-inventory`}
                    label="Link stock item (optional)"
                    error={errors[`${prefix}inventory_item_id`]}
                    hint="Choosing a stock item prefills the medication details and records the line against that batch."
                    className="sm:col-span-2 lg:col-span-3"
                  >
                    <select
                      id={`order-${line.key}-inventory`}
                      name={`${prefix}inventory_item_id`}
                      value={line.inventory_item_id}
                      onChange={(event) =>
                        handleInventoryChange(index, event.target.value)
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="">No stock link</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.medication_name}
                          {item.strength ? ` ${item.strength}` : ""} ·{" "}
                          {item.resident_name ?? "Pooled"} ·{" "}
                          {formatQuantity(item.quantity_on_hand, item.unit)} on
                          hand
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    id={`order-${line.key}-medication`}
                    label="Medication"
                    error={errors[`${prefix}medication_name`]}
                  >
                    <input
                      id={`order-${line.key}-medication`}
                      name={`${prefix}medication_name`}
                      value={line.medication_name}
                      onChange={(event) =>
                        updateLine(index, {
                          medication_name: event.target.value,
                        })
                      }
                      required
                      maxLength={160}
                      placeholder="Amoxicillin"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-strength`}
                    label="Strength"
                    error={errors[`${prefix}strength`]}
                  >
                    <input
                      id={`order-${line.key}-strength`}
                      name={`${prefix}strength`}
                      value={line.strength}
                      onChange={(event) =>
                        updateLine(index, { strength: event.target.value })
                      }
                      maxLength={80}
                      placeholder="500 mg"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-form`}
                    label="Dosage form"
                    error={errors[`${prefix}dosage_form`]}
                  >
                    <input
                      id={`order-${line.key}-form`}
                      name={`${prefix}dosage_form`}
                      value={line.dosage_form}
                      onChange={(event) =>
                        updateLine(index, { dosage_form: event.target.value })
                      }
                      maxLength={80}
                      placeholder="Capsule"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-unit`}
                    label="Unit"
                    error={errors[`${prefix}unit`]}
                  >
                    <input
                      id={`order-${line.key}-unit`}
                      name={`${prefix}unit`}
                      value={line.unit}
                      onChange={(event) =>
                        updateLine(index, { unit: event.target.value })
                      }
                      maxLength={40}
                      placeholder="capsule"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-quantity`}
                    label="Quantity"
                    error={errors[`${prefix}quantity`]}
                  >
                    <input
                      id={`order-${line.key}-quantity`}
                      name={`${prefix}quantity`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, { quantity: event.target.value })
                      }
                      required
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-price`}
                    label="Unit price"
                    error={errors[`${prefix}unit_price`]}
                  >
                    <input
                      id={`order-${line.key}-price`}
                      name={`${prefix}unit_price`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unit_price}
                      onChange={(event) =>
                        updateLine(index, { unit_price: event.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id={`order-${line.key}-notes`}
                    label="Line notes (optional)"
                    error={errors[`${prefix}notes`]}
                    className="sm:col-span-2 lg:col-span-3"
                  >
                    <input
                      id={`order-${line.key}-notes`}
                      name={`${prefix}notes`}
                      value={line.notes}
                      onChange={(event) =>
                        updateLine(index, { notes: event.target.value })
                      }
                      maxLength={500}
                      placeholder="e.g. original pack, do not substitute"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              </div>
            );
          })}

          {errors.item_count ? (
            <p role="alert" className="text-xs text-rose-700">
              {errors.item_count}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="max-w-md text-xs leading-5 text-slate-500">
            The order is created as pending. You can withdraw it until the
            pharmacy acts, and confirm receipt once it is prepared.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Cancel
            </button>
            <SubmitButton label="Submit order" pendingLabel="Submitting…" />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function CreateOrderDrawer({
  pharmacies,
  residents,
  inventory,
}: {
  pharmacies: PharmacyRow[];
  residents: ResidentRow[];
  inventory: InventoryWithResident[];
}) {
  const [open, setOpen] = useState(false);
  const hasPharmacy = pharmacies.length > 0;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={!hasPharmacy}
        title={
          hasPharmacy
            ? undefined
            : "No active pharmacy is available. Ask a system administrator to register one."
        }
        onClick={() => {
          if (hasPharmacy) setOpen(true);
        }}
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        New order
      </button>

      {open ? (
        <CreateOrderForm
          pharmacies={pharmacies}
          residents={residents}
          inventory={inventory}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

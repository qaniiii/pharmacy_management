"use client";

import { useActionState, useState } from "react";

import {
  createResidentAction,
  updateResidentAction,
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
import {
  INITIAL_WELFARE_FORM_STATE,
  type WelfareFormState,
} from "@/lib/welfare/form-state";
import type { ResidentRow } from "@/lib/types/database";

const GENDER_OPTIONS = [
  "Female",
  "Male",
  "Non-binary",
  "Prefer not to say",
  "Other",
] as const;

function ResidentForm({
  mode,
  resident,
  idPrefix,
}: {
  mode: "create" | "edit";
  resident?: ResidentRow;
  idPrefix: string;
}) {
  const action =
    mode === "create" ? createResidentAction : updateResidentAction;
  const [state, formAction] = useActionState<
    WelfareFormState,
    FormData
  >(action, INITIAL_WELFARE_FORM_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" ? (
        <input type="hidden" name="resident_id" value={resident?.id ?? ""} />
      ) : null}

      <FormError
        message={state.status === "error" ? state.message : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-name`}
          name="full_name"
          label="Full name"
          required
          maxLength={120}
          placeholder="Ada Okafor"
          defaultValue={resident?.full_name}
          error={errors.full_name}
          className="sm:col-span-2"
        />

        <TextField
          id={`${idPrefix}-dob`}
          name="date_of_birth"
          label="Date of birth"
          type="date"
          defaultValue={resident?.date_of_birth ?? ""}
          error={errors.date_of_birth}
        />

        <Field id={`${idPrefix}-gender`} label="Gender" error={errors.gender}>
          <select
            id={`${idPrefix}-gender`}
            name="gender"
            defaultValue={resident?.gender ?? ""}
            className={INPUT_CLASS}
          >
            <option value="">Not specified</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <TextField
          id={`${idPrefix}-room`}
          name="room_number"
          label="Room number"
          maxLength={40}
          placeholder="Room 4B"
          defaultValue={resident?.room_number ?? ""}
          error={errors.room_number}
        />

        <TextField
          id={`${idPrefix}-mrn`}
          name="medical_record_number"
          label="Medical record number"
          maxLength={60}
          placeholder="MRN-000123"
          defaultValue={resident?.medical_record_number ?? ""}
          error={errors.medical_record_number}
        />

        <TextField
          id={`${idPrefix}-allergies`}
          name="allergies"
          label="Allergies"
          maxLength={600}
          placeholder="Penicillin, latex"
          defaultValue={resident?.allergies.join(", ") ?? ""}
          hint="Separate with commas. Leave blank when there are none."
          error={errors.allergies}
          className="sm:col-span-2"
        />

        <TextAreaField
          id={`${idPrefix}-notes`}
          name="care_notes"
          label="Care notes"
          rows={3}
          maxLength={2000}
          placeholder="Mobility support, swallowing precautions, …"
          defaultValue={resident?.care_notes ?? ""}
          error={errors.care_notes}
          className="sm:col-span-2"
        />
      </div>

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <SubmitButton
          label={mode === "create" ? "Add resident" : "Save changes"}
          pendingLabel={mode === "create" ? "Adding…" : "Saving…"}
        />
      </div>
    </form>
  );
}

export function ResidentEditor({
  mode,
  resident,
  triggerLabel,
  variant = "light",
}: {
  mode: "create" | "edit";
  resident?: ResidentRow;
  triggerLabel: string;
  variant?: "dark" | "light";
}) {
  const [open, setOpen] = useState(false);
  const idPrefix = resident ? `resident-${resident.id}` : "resident-new";
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
        title={mode === "create" ? "Add a resident" : "Edit resident"}
        description={
          mode === "create"
            ? "The resident is added as active. Medical record numbers must be unique within this home."
            : "Changes are written to the resident register. Deactivate rather than delete when someone leaves."
        }
        size="lg"
      >
        <ResidentForm
          mode={mode}
          resident={resident}
          idPrefix={idPrefix}
        />
      </Modal>
    </>
  );
}

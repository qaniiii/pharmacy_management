"use client";

import { useActionState } from "react";

import { createPharmacyAction } from "@/app/admin/actions";
import { FormError, TextField } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { INITIAL_ADMIN_FORM_STATE } from "@/lib/admin/form-state";

export function CreatePharmacyForm() {
  const [state, formAction] = useActionState(
    createPharmacyAction,
    INITIAL_ADMIN_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Register a pharmacy
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        The licence number must be unique. New tenants start active.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <FormError message={state.status === "error" ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="pharmacy-name"
            label="Name"
            required
            maxLength={120}
            placeholder="Central Pharmacy"
            error={errors.name}
            className="sm:col-span-2"
          />
          <TextField
            id="pharmacy-licence"
            label="Licence number"
            name="license_number"
            required
            maxLength={60}
            placeholder="PH-2026-0088"
            error={errors.license_number}
          />
          <TextField
            id="pharmacy-contact"
            label="Contact person"
            name="contact_person"
            maxLength={120}
            placeholder="Dispensing manager"
            error={errors.contact_person}
          />
          <TextField
            id="pharmacy-address"
            label="Address"
            name="address_line1"
            required
            maxLength={160}
            placeholder="48 Market Street"
            autoComplete="address-line1"
            error={errors.address_line1}
            className="sm:col-span-2"
          />
          <TextField
            id="pharmacy-city"
            label="City"
            required
            maxLength={80}
            autoComplete="address-level2"
            error={errors.city}
          />
          <TextField
            id="pharmacy-region"
            label="Region"
            maxLength={80}
            autoComplete="address-level1"
            error={errors.region}
          />
          <TextField
            id="pharmacy-postal"
            label="Postal code"
            name="postal_code"
            maxLength={20}
            autoComplete="postal-code"
            error={errors.postal_code}
          />
          <TextField
            id="pharmacy-phone"
            label="Phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            error={errors.phone}
          />
          <TextField
            id="pharmacy-email"
            label="Email"
            type="email"
            maxLength={254}
            autoComplete="email"
            hint="Optional. Used for order notifications later."
            error={errors.email}
            className="sm:col-span-2"
          />
        </div>

        <SubmitButton label="Register pharmacy" pendingLabel="Registering…" />
      </form>
    </section>
  );
}

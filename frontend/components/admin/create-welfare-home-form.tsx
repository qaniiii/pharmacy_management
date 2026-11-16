"use client";

import { useActionState } from "react";

import { createWelfareHomeAction } from "@/app/admin/actions";
import { FormError, TextField } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { INITIAL_ADMIN_FORM_STATE } from "@/lib/admin/form-state";

export function CreateWelfareHomeForm() {
  const [state, formAction] = useActionState(
    createWelfareHomeAction,
    INITIAL_ADMIN_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Register a welfare home
      </h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        The registration number must be unique. New tenants start active.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <FormError message={state.status === "error" ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="home-name"
            label="Name"
            name="name"
            required
            maxLength={120}
            placeholder="Riverside Care Home"
            error={errors.name}
            className="sm:col-span-2"
          />
          <TextField
            id="home-registration"
            label="Registration number"
            name="registration_number"
            required
            maxLength={60}
            placeholder="WH-2026-014"
            error={errors.registration_number}
            className="sm:col-span-2"
          />
          <TextField
            id="home-address"
            label="Address"
            name="address_line1"
            required
            maxLength={160}
            placeholder="12 Riverside Drive"
            autoComplete="address-line1"
            error={errors.address_line1}
            className="sm:col-span-2"
          />
          <TextField
            id="home-city"
            label="City"
            name="city"
            required
            maxLength={80}
            autoComplete="address-level2"
            error={errors.city}
          />
          <TextField
            id="home-region"
            label="Region"
            name="region"
            maxLength={80}
            autoComplete="address-level1"
            error={errors.region}
          />
          <TextField
            id="home-postal"
            label="Postal code"
            name="postal_code"
            maxLength={20}
            autoComplete="postal-code"
            error={errors.postal_code}
          />
          <TextField
            id="home-phone"
            label="Phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            error={errors.phone}
          />
          <TextField
            id="home-email"
            label="Email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            hint="Optional. Used for order notifications later."
            error={errors.email}
            className="sm:col-span-2"
          />
        </div>

        <SubmitButton
          label="Register welfare home"
          pendingLabel="Registering…"
        />
      </form>
    </section>
  );
}

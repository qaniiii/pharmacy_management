"use client";

import { useActionState, useState } from "react";

import { provisionUserAction } from "@/app/admin/actions";
import {
  Field,
  FormError,
  INPUT_CLASS,
  TextField,
} from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import type { TenantOption } from "@/lib/admin/data";
import { INITIAL_ADMIN_FORM_STATE } from "@/lib/admin/form-state";
import type { ProvisionableRole, ProvisionMode } from "@/lib/types/api";

export function ProvisionUserForm({
  homes,
  pharmacies,
}: {
  homes: TenantOption[];
  pharmacies: TenantOption[];
}) {
  const [state, formAction] = useActionState(
    provisionUserAction,
    INITIAL_ADMIN_FORM_STATE,
  );
  const [role, setRole] = useState<ProvisionableRole>("welfare_admin");
  const [mode, setMode] = useState<ProvisionMode>("invite");

  const errors = state.fieldErrors ?? {};
  const options = role === "welfare_admin" ? homes : pharmacies;
  const activeCount = options.filter((option) => option.is_active).length;
  const tenantField = role === "welfare_admin" ? "welfare_home_id" : "pharmacy_id";
  const tenantLabel = role === "welfare_admin" ? "Welfare home" : "Pharmacy";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Provision an administrator
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Creates the Supabase Auth account with the role and tenant metadata
            that <code className="font-mono">handle_new_user()</code> needs, so
            the profile is built in one transaction.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
          Service role, server-side only
        </span>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <FormError message={state.status === "error" ? state.message : undefined} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            id="user-email"
            label="Work email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="name@organisation.org"
            error={errors.email}
          />
          <TextField
            id="user-name"
            label="Full name"
            name="full_name"
            required
            maxLength={120}
            autoComplete="off"
            error={errors.full_name}
          />
          <TextField
            id="user-phone"
            label="Phone"
            type="tel"
            maxLength={40}
            autoComplete="off"
            hint="Optional. Stored on the profile."
            error={errors.phone}
          />

          <Field id="user-role" label="Role" error={errors.role}>
            <select
              id="user-role"
              name="role"
              required
              value={role}
              onChange={(event) =>
                setRole(event.target.value as ProvisionableRole)
              }
              className={INPUT_CLASS}
            >
              <option value="welfare_admin">Welfare home administrator</option>
              <option value="pharmacy_admin">Pharmacy administrator</option>
            </select>
          </Field>

          <Field
            id="user-tenant"
            label={tenantLabel}
            error={
              role === "welfare_admin"
                ? errors.welfare_home_id
                : errors.pharmacy_id
            }
            hint={
              activeCount === 0
                ? `No active ${tenantLabel.toLowerCase()} available. Create one first.`
                : undefined
            }
          >
            <select
              key={role}
              id="user-tenant"
              name={tenantField}
              required
              defaultValue=""
              disabled={activeCount === 0}
              className={INPUT_CLASS}
            >
              <option value="" disabled>
                Select a {tenantLabel.toLowerCase()}
              </option>
              {options.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={!option.is_active}
                >
                  {option.name}
                  {option.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="user-mode"
            label="Access delivery"
            error={errors.mode}
            hint="Invitations link to the sign-in page."
          >
            <select
              id="user-mode"
              name="mode"
              required
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as ProvisionMode)
              }
              className={INPUT_CLASS}
            >
              <option value="invite">Send invitation email</option>
              <option value="password">Set a password now</option>
            </select>
          </Field>

          {mode === "password" ? (
            <TextField
              id="user-password"
              label="Temporary password"
              type="password"
              minLength={8}
              maxLength={72}
              required
              autoComplete="new-password"
              hint="At least 8 characters. Share it over a secure channel."
              error={errors.password}
              className="sm:col-span-2 lg:col-span-3"
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <SubmitButton
            label={
              mode === "invite" ? "Send invitation" : "Create administrator"
            }
            pendingLabel={mode === "invite" ? "Sending…" : "Creating…"}
          />
          <p className="text-xs text-slate-500">
            The profile is verified after creation; a mismatch rolls the auth
            user back automatically.
          </p>
        </div>
      </form>
    </section>
  );
}

/**
 * Server-side validation for the admin forms.
 *
 * Client-side attributes are a convenience; every rule here is enforced again
 * in the server action. The backend repeats the checks that protect account
 * creation, because a server action can be called directly.
 */

import type {
  ProvisionableRole,
  ProvisionUserPayload,
} from "@/lib/types/api";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldErrors = Record<string, string>;

export interface TenantFormValues {
  name: string;
  address_line1: string;
  city: string;
  region: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
}

export interface WelfareHomeFormValues extends TenantFormValues {
  registration_number: string;
}

export interface PharmacyFormValues extends TenantFormValues {
  license_number: string;
  contact_person: string | null;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(formData: FormData, name: string): string | null {
  const value = text(formData, name);
  return value.length > 0 ? value : null;
}

function checkRequired(
  errors: FieldErrors,
  field: string,
  label: string,
  value: string,
  maxLength: number,
): void {
  if (!value) {
    errors[field] = `${label} is required.`;
  } else if (value.length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`;
  }
}

function checkOptionalLength(
  errors: FieldErrors,
  field: string,
  label: string,
  value: string | null,
  maxLength: number,
): void {
  if (value && value.length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`;
  }
}

function checkOptionalEmail(
  errors: FieldErrors,
  field: string,
  value: string | null,
): void {
  if (!value) return;
  if (value.length > 254) {
    errors[field] = "Email must be 254 characters or fewer.";
  } else if (!EMAIL_PATTERN.test(value)) {
    errors[field] = "Enter a valid email address.";
  }
}

/** Shared address/contact rules for welfare homes and pharmacies. */
function tenantValues(formData: FormData, errors: FieldErrors): TenantFormValues {
  const name = text(formData, "name");
  const addressLine1 = text(formData, "address_line1");
  const city = text(formData, "city");
  const region = optionalText(formData, "region");
  const postalCode = optionalText(formData, "postal_code");
  const phone = optionalText(formData, "phone");
  const email = optionalText(formData, "email");

  checkRequired(errors, "name", "Name", name, 120);
  checkRequired(errors, "address_line1", "Address", addressLine1, 160);
  checkRequired(errors, "city", "City", city, 80);
  checkOptionalLength(errors, "region", "Region", region, 80);
  checkOptionalLength(errors, "postal_code", "Postal code", postalCode, 20);
  checkOptionalLength(errors, "phone", "Phone", phone, 40);
  checkOptionalEmail(errors, "email", email);

  return {
    name,
    address_line1: addressLine1,
    city,
    region,
    postal_code: postalCode,
    phone,
    email,
  };
}

export function parseWelfareHomeForm(formData: FormData): {
  values: WelfareHomeFormValues;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};
  const base = tenantValues(formData, fieldErrors);
  const registrationNumber = text(formData, "registration_number");

  checkRequired(
    fieldErrors,
    "registration_number",
    "Registration number",
    registrationNumber,
    60,
  );

  return {
    values: { ...base, registration_number: registrationNumber },
    fieldErrors,
  };
}

export function parsePharmacyForm(formData: FormData): {
  values: PharmacyFormValues;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};
  const base = tenantValues(formData, fieldErrors);
  const licenseNumber = text(formData, "license_number");
  const contactPerson = optionalText(formData, "contact_person");

  checkRequired(fieldErrors, "license_number", "Licence number", licenseNumber, 60);
  checkOptionalLength(
    fieldErrors,
    "contact_person",
    "Contact person",
    contactPerson,
    120,
  );

  return {
    values: {
      ...base,
      license_number: licenseNumber,
      contact_person: contactPerson,
    },
    fieldErrors,
  };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface ProvisionFormResult {
  payload: ProvisionUserPayload | null;
  fieldErrors: FieldErrors;
}

/**
 * Builds the FastAPI payload.
 *
 * `mode` only decides whether a password is sent: the backend treats a missing
 * password as "send an invitation", so the two modes cannot disagree.
 */
export function parseProvisionForm(formData: FormData): ProvisionFormResult {
  const fieldErrors: FieldErrors = {};

  const email = text(formData, "email").toLowerCase();
  const fullName = text(formData, "full_name");
  const phone = optionalText(formData, "phone");
  const role = text(formData, "role") as ProvisionableRole;
  const mode = text(formData, "mode");
  const password = String(formData.get("password") ?? "");

  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (email.length > 254) {
    fieldErrors.email = "Email must be 254 characters or fewer.";
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  checkRequired(fieldErrors, "full_name", "Full name", fullName, 120);
  checkOptionalLength(fieldErrors, "phone", "Phone", phone, 40);

  if (role !== "welfare_admin" && role !== "pharmacy_admin") {
    fieldErrors.role = "Choose a role.";
  }

  const welfareHomeId =
    role === "welfare_admin" ? text(formData, "welfare_home_id") : "";
  const pharmacyId =
    role === "pharmacy_admin" ? text(formData, "pharmacy_id") : "";

  if (role === "welfare_admin") {
    if (!welfareHomeId) {
      fieldErrors.welfare_home_id = "Choose a welfare home.";
    } else if (!isUuid(welfareHomeId)) {
      fieldErrors.welfare_home_id = "Choose a valid welfare home.";
    }
  }

  if (role === "pharmacy_admin") {
    if (!pharmacyId) {
      fieldErrors.pharmacy_id = "Choose a pharmacy.";
    } else if (!isUuid(pharmacyId)) {
      fieldErrors.pharmacy_id = "Choose a valid pharmacy.";
    }
  }

  if (mode === "password") {
    if (password.length < 8) {
      fieldErrors.password = "Use at least 8 characters.";
    } else if (password.length > 72) {
      fieldErrors.password = "Use 72 characters or fewer.";
    }
  } else if (mode !== "invite") {
    fieldErrors.mode = "Choose how the administrator receives access.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { payload: null, fieldErrors };
  }

  return {
    payload: {
      email,
      full_name: fullName,
      phone,
      role,
      welfare_home_id: role === "welfare_admin" ? welfareHomeId : null,
      pharmacy_id: role === "pharmacy_admin" ? pharmacyId : null,
      ...(mode === "password" ? { password } : {}),
    },
    fieldErrors,
  };
}

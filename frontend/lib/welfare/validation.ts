/**
 * Server-side validation for the welfare-home forms.
 *
 * The database is still the authority: these checks only exist to return a
 * helpful field error before a request reaches PostgREST. Every rule mirrors a
 * schema constraint in `supabase/migrations/20261115000100_core_schema.sql`.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FieldErrors = Record<string, string>;

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

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function parseNonNegativeDecimal(raw: string): number | null {
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function parsePositiveDecimal(raw: string): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseAllergies(raw: string, errors: FieldErrors): string[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const values: string[] = [];

  for (const part of raw.split(/[,\n]/)) {
    const value = part.trim();
    if (!value) continue;
    if (value.length > 80) {
      errors.allergies = "Each allergy must be 80 characters or fewer.";
      continue;
    }
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      values.push(value);
    }
  }

  if (values.length > 30) {
    errors.allergies = "List at most 30 allergies.";
    return values.slice(0, 30);
  }

  return values;
}

/* -------------------------------------------------------------------------- */
/* Residents                                                                  */
/* -------------------------------------------------------------------------- */

export interface ResidentFormValues {
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  room_number: string | null;
  medical_record_number: string | null;
  allergies: string[];
  care_notes: string | null;
}

export function parseResidentForm(formData: FormData): {
  values: ResidentFormValues;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};

  const fullName = text(formData, "full_name");
  const dateOfBirth = optionalText(formData, "date_of_birth");
  const gender = optionalText(formData, "gender");
  const roomNumber = optionalText(formData, "room_number");
  const medicalRecordNumber = optionalText(formData, "medical_record_number");
  const careNotes = optionalText(formData, "care_notes");
  const allergies = parseAllergies(text(formData, "allergies"), fieldErrors);

  checkRequired(fieldErrors, "full_name", "Full name", fullName, 120);
  if (dateOfBirth && !isIsoDate(dateOfBirth)) {
    fieldErrors.date_of_birth = "Enter a valid date.";
  }
  checkOptionalLength(fieldErrors, "gender", "Gender", gender, 40);
  checkOptionalLength(fieldErrors, "room_number", "Room number", roomNumber, 40);
  checkOptionalLength(
    fieldErrors,
    "medical_record_number",
    "Medical record number",
    medicalRecordNumber,
    60,
  );
  checkOptionalLength(fieldErrors, "care_notes", "Care notes", careNotes, 2000);

  return {
    values: {
      full_name: fullName,
      date_of_birth: dateOfBirth,
      gender,
      room_number: roomNumber,
      medical_record_number: medicalRecordNumber,
      allergies,
      care_notes: careNotes,
    },
    fieldErrors,
  };
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

export interface InventoryFormValues {
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
}

export function parseInventoryForm(formData: FormData): {
  values: InventoryFormValues;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};

  const residentId = optionalText(formData, "resident_id");
  const medicationName = text(formData, "medication_name");
  const genericName = optionalText(formData, "generic_name");
  const strength = optionalText(formData, "strength");
  const dosageForm = optionalText(formData, "dosage_form");
  const unit = text(formData, "unit") || "unit";
  const quantityRaw = text(formData, "quantity_on_hand");
  const reorderRaw = text(formData, "reorder_level");
  const batchNumber = optionalText(formData, "batch_number");
  const expiryDate = optionalText(formData, "expiry_date");
  const storageLocation = optionalText(formData, "storage_location");
  const notes = optionalText(formData, "notes");

  checkRequired(
    fieldErrors,
    "medication_name",
    "Medication name",
    medicationName,
    160,
  );
  if (residentId && !isUuid(residentId)) {
    fieldErrors.resident_id = "Choose a valid resident.";
  }
  checkOptionalLength(fieldErrors, "generic_name", "Generic name", genericName, 160);
  checkOptionalLength(fieldErrors, "strength", "Strength", strength, 80);
  checkOptionalLength(fieldErrors, "dosage_form", "Dosage form", dosageForm, 80);
  checkOptionalLength(fieldErrors, "unit", "Unit", unit, 40);

  const quantity = parseNonNegativeDecimal(quantityRaw);
  if (quantity === null) {
    fieldErrors.quantity_on_hand = "Enter a quantity of 0 or more.";
  }

  const reorderLevel = parseNonNegativeDecimal(reorderRaw);
  if (reorderLevel === null) {
    fieldErrors.reorder_level = "Enter a reorder level of 0 or more.";
  }

  if (expiryDate && !isIsoDate(expiryDate)) {
    fieldErrors.expiry_date = "Enter a valid expiry date.";
  }
  checkOptionalLength(fieldErrors, "batch_number", "Batch number", batchNumber, 80);
  checkOptionalLength(
    fieldErrors,
    "storage_location",
    "Storage location",
    storageLocation,
    120,
  );
  checkOptionalLength(fieldErrors, "notes", "Notes", notes, 2000);

  return {
    values: {
      resident_id: residentId,
      medication_name: medicationName,
      generic_name: genericName,
      strength,
      dosage_form: dosageForm,
      unit,
      quantity_on_hand: quantity ?? 0,
      reorder_level: reorderLevel ?? 0,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      storage_location: storageLocation,
      notes,
    },
    fieldErrors,
  };
}

export interface QuantityAdjustmentValues {
  item_id: string;
  amount: number;
  mode: "dispense" | "restock";
}

export function parseQuantityAdjustment(formData: FormData): {
  values: QuantityAdjustmentValues | null;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};

  const itemId = text(formData, "item_id");
  const amountRaw = text(formData, "amount");
  const mode = text(formData, "mode");

  if (!isUuid(itemId)) {
    fieldErrors.item_id = "Invalid stock item.";
  }

  const amount = parsePositiveDecimal(amountRaw);
  if (amount === null) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }

  if (mode !== "dispense" && mode !== "restock") {
    fieldErrors.mode = "Choose dispense or restock.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { values: null, fieldErrors };
  }

  return {
    values: {
      item_id: itemId,
      amount: amount as number,
      mode: mode as QuantityAdjustmentValues["mode"],
    },
    fieldErrors,
  };
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

export interface OrderLineValues {
  inventory_item_id: string | null;
  medication_name: string;
  strength: string | null;
  dosage_form: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
}

export interface OrderFormValues {
  pharmacy_id: string;
  resident_id: string | null;
  resident_reference: string | null;
  notes: string | null;
  items: OrderLineValues[];
}

/**
 * Reads the dynamically indexed line fields written by the order drawer:
 * `item_0_medication_name`, `item_0_quantity`, … plus `item_count`.
 */
export function parseOrderForm(formData: FormData): {
  values: OrderFormValues | null;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};

  const pharmacyId = text(formData, "pharmacy_id");
  const residentId = optionalText(formData, "resident_id");
  const residentReference = optionalText(formData, "resident_reference");
  const notes = optionalText(formData, "notes");

  if (!isUuid(pharmacyId)) {
    fieldErrors.pharmacy_id = "Choose a registered pharmacy.";
  }
  if (residentId && !isUuid(residentId)) {
    fieldErrors.resident_id = "Choose a valid resident.";
  }
  checkOptionalLength(
    fieldErrors,
    "resident_reference",
    "Resident reference",
    residentReference,
    120,
  );
  checkOptionalLength(fieldErrors, "notes", "Order notes", notes, 2000);

  const parsedCount = Number.parseInt(text(formData, "item_count"), 10);
  let count = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 0;
  if (count > 50) {
    fieldErrors.item_count = "Add at most 50 medication lines.";
    count = 50;
  }
  if (count === 0) {
    fieldErrors.item_count = "Add at least one medication line.";
  }

  const items: OrderLineValues[] = [];

  for (let index = 0; index < count; index += 1) {
    const prefix = `item_${index}_`;
    const lineLabel = `Line ${index + 1}`;

    const medicationName = text(formData, `${prefix}medication_name`);
    const strength = optionalText(formData, `${prefix}strength`);
    const dosageForm = optionalText(formData, `${prefix}dosage_form`);
    const unit = text(formData, `${prefix}unit`) || "unit";
    const quantity = parsePositiveDecimal(text(formData, `${prefix}quantity`));
    const unitPrice = parseNonNegativeDecimal(
      text(formData, `${prefix}unit_price`),
    );
    const lineNotes = optionalText(formData, `${prefix}notes`);
    const inventoryItemId = optionalText(
      formData,
      `${prefix}inventory_item_id`,
    );

    checkRequired(
      fieldErrors,
      `${prefix}medication_name`,
      `${lineLabel} medication`,
      medicationName,
      160,
    );
    checkOptionalLength(
      fieldErrors,
      `${prefix}strength`,
      `${lineLabel} strength`,
      strength,
      80,
    );
    checkOptionalLength(
      fieldErrors,
      `${prefix}dosage_form`,
      `${lineLabel} dosage form`,
      dosageForm,
      80,
    );
    checkOptionalLength(fieldErrors, `${prefix}unit`, `${lineLabel} unit`, unit, 40);

    if (quantity === null) {
      fieldErrors[`${prefix}quantity`] = `${lineLabel}: enter a quantity greater than zero.`;
    }
    if (unitPrice === null) {
      fieldErrors[`${prefix}unit_price`] = `${lineLabel}: enter a price of 0 or more.`;
    }
    if (inventoryItemId && !isUuid(inventoryItemId)) {
      fieldErrors[`${prefix}inventory_item_id`] = `${lineLabel}: choose a valid stock item.`;
    }
    checkOptionalLength(
      fieldErrors,
      `${prefix}notes`,
      `${lineLabel} notes`,
      lineNotes,
      500,
    );

    items.push({
      inventory_item_id: inventoryItemId,
      medication_name: medicationName,
      strength,
      dosage_form: dosageForm,
      unit,
      quantity: quantity ?? 0,
      unit_price: unitPrice ?? 0,
      notes: lineNotes,
    });
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { values: null, fieldErrors };
  }

  return {
    values: {
      pharmacy_id: pharmacyId,
      resident_id: residentId,
      resident_reference: residentReference,
      notes,
      items,
    },
    fieldErrors,
  };
}

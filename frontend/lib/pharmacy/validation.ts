/**
 * Server-side validation for the pharmacy fulfilment forms.
 *
 * Only the fields the pharmacy is allowed to drive are parsed: the order id,
 * per-line unit prices while pending, and a rejection reason. The database still
 * enforces the state machine, the price-only update policy and the
 * non-negative price constraint.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Up to 10 integer digits and 2 decimals, matching numeric(12, 2). */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export type FieldErrors = Record<string, string>;

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseOrderId(formData: FormData): {
  orderId: string | null;
  fieldErrors: FieldErrors;
} {
  const orderId = text(formData, "order_id");

  if (!isUuid(orderId)) {
    return {
      orderId: null,
      fieldErrors: { order_id: "Invalid order." },
    };
  }

  return { orderId, fieldErrors: {} };
}

export interface PricedLine {
  id: string;
  unit_price: number;
}

/**
 * Reads `price_<order_item_id>` for every line the server loaded.
 *
 * Unlisted extra fields are ignored, so a crafted form cannot price a line from
 * another order. A missing or malformed price rejects the whole submission
 * before any write is attempted.
 */
export function parseOrderPricing(
  formData: FormData,
  items: ReadonlyArray<{ id: string }>,
): { prices: PricedLine[]; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const prices: PricedLine[] = [];

  for (const item of items) {
    const field = `price_${item.id}`;
    const raw = text(formData, field);

    if (!raw) {
      fieldErrors[field] = "Enter a unit price for every line.";
      continue;
    }
    if (!PRICE_PATTERN.test(raw)) {
      fieldErrors[field] =
        "Use a non-negative price with at most two decimals.";
      continue;
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) {
      fieldErrors[field] = "Enter a valid unit price.";
      continue;
    }

    prices.push({ id: item.id, unit_price: value });
  }

  return { prices, fieldErrors };
}

export function parseRejectionReason(formData: FormData): {
  reason: string;
  fieldErrors: FieldErrors;
} {
  const reason = text(formData, "rejection_reason");

  if (!reason) {
    return {
      reason,
      fieldErrors: { rejection_reason: "Give the welfare home a reason." },
    };
  }
  if (reason.length > 1000) {
    return {
      reason,
      fieldErrors: {
        rejection_reason: "Keep the reason to 1000 characters or fewer.",
      },
    };
  }

  return { reason, fieldErrors: {} };
}

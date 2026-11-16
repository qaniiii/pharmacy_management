"use server";

/**
 * Server actions for the pharmacy fulfilment portal.
 *
 * Every action re-checks the caller's role and derives `pharmacy_id` from
 * `profiles` rather than trusting a form field. The cookie-bound client keeps
 * RLS in force, so a pharmacy can only ever act on its own orders. The database
 * state-machine trigger and the price-only guard from
 * `20261116000100_pharmacy_order_pricing.sql` remain the final authority.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/profile";
import type { PharmacyFormState } from "@/lib/pharmacy/form-state";
import {
  parseOrderId,
  parseOrderPricing,
  parseRejectionReason,
} from "@/lib/pharmacy/validation";

function errorState(
  message: string,
  fieldErrors?: Record<string, string>,
): PharmacyFormState {
  return { status: "error", message, fieldErrors };
}

function backToQueue(message: string): never {
  redirect(`/pharmacy?notice=${encodeURIComponent(message)}`);
}

const NO_PHARMACY =
  "Your profile is not linked to a pharmacy. Contact a system administrator.";

/* -------------------------------------------------------------------------- */
/* Pending -> accepted (with pricing)                                         */
/* -------------------------------------------------------------------------- */

export async function acceptOrderAction(
  _previous: PharmacyFormState,
  formData: FormData,
): Promise<PharmacyFormState> {
  const { supabase, profile } = await requireRole("pharmacy_admin");
  const pharmacyId = profile.pharmacy_id;

  if (!pharmacyId) return errorState(NO_PHARMACY);

  const { orderId, fieldErrors } = parseOrderId(formData);
  if (!orderId) return errorState("Invalid order.", fieldErrors);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .eq("pharmacy_id", pharmacyId)
    .maybeSingle();

  if (orderError) {
    return errorState(`Could not load the order: ${orderError.message}`);
  }
  if (!order) {
    return errorState("That order is not in your pharmacy's queue.");
  }
  if (order.status !== "pending") {
    return errorState(
      "This order is no longer pending. Refresh the page to see its current status.",
    );
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, medication_name, unit_price")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return errorState(`Could not load the order lines: ${itemsError.message}`);
  }
  if (!items || items.length === 0) {
    return errorState(
      "This order has no medication lines, so it cannot be accepted.",
    );
  }

  const { prices, fieldErrors: priceErrors } = parseOrderPricing(
    formData,
    items,
  );
  if (Object.keys(priceErrors).length > 0) {
    return errorState("Check the unit price on every line.", priceErrors);
  }

  // Prices are only writable while the order is pending. If a later line fails
  // the order stays pending and the operator can retry; no status changes yet.
  for (const price of prices) {
    const line = items.find((item) => item.id === price.id);
    const { data, error } = await supabase
      .from("order_items")
      .update({ unit_price: price.unit_price })
      .eq("id", price.id)
      .eq("order_id", orderId)
      .select("id")
      .maybeSingle();

    if (error) {
      return errorState(
        `Could not save the price for ${line?.medication_name ?? "a line"}: ${error.message}`,
      );
    }
    if (!data) {
      return errorState(
        `The price for ${line?.medication_name ?? "a line"} could not be saved because the order changed. Refresh the page and try again.`,
      );
    }
  }

  const { data: accepted, error: acceptError } = await supabase
    .from("orders")
    .update({ status: "accepted" })
    .eq("id", orderId)
    .eq("pharmacy_id", pharmacyId)
    .eq("status", "pending")
    .select("order_number")
    .maybeSingle();

  if (acceptError) {
    return errorState(`Could not accept the order: ${acceptError.message}`);
  }
  if (!accepted) {
    return errorState(
      "The order changed before it could be accepted. Refresh the page and try again.",
    );
  }

  revalidatePath("/pharmacy");
  backToQueue(
    `Order ${accepted.order_number} was accepted and the prices were saved.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Pending -> rejected                                                        */
/* -------------------------------------------------------------------------- */

export async function rejectOrderAction(
  _previous: PharmacyFormState,
  formData: FormData,
): Promise<PharmacyFormState> {
  const { supabase, profile } = await requireRole("pharmacy_admin");
  const pharmacyId = profile.pharmacy_id;

  if (!pharmacyId) return errorState(NO_PHARMACY);

  const { orderId, fieldErrors } = parseOrderId(formData);
  if (!orderId) return errorState("Invalid order.", fieldErrors);

  const { reason, fieldErrors: reasonErrors } =
    parseRejectionReason(formData);
  if (Object.keys(reasonErrors).length > 0) {
    return errorState("A rejection reason is required.", reasonErrors);
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", orderId)
    .eq("pharmacy_id", pharmacyId)
    .eq("status", "pending")
    .select("order_number")
    .maybeSingle();

  if (error) {
    return errorState(
      error.code === "23514"
        ? "A rejection reason is required."
        : `Could not reject the order: ${error.message}`,
    );
  }
  if (!data) {
    return errorState(
      "Only a pending order can be rejected. Refresh the page to see its current status.",
    );
  }

  revalidatePath("/pharmacy");
  backToQueue(`Order ${data.order_number} was rejected.`);
}

/* -------------------------------------------------------------------------- */
/* Accepted -> prepared                                                       */
/* -------------------------------------------------------------------------- */

export async function markOrderPreparedAction(
  _previous: PharmacyFormState,
  formData: FormData,
): Promise<PharmacyFormState> {
  const { supabase, profile } = await requireRole("pharmacy_admin");
  const pharmacyId = profile.pharmacy_id;

  if (!pharmacyId) return errorState(NO_PHARMACY);

  const { orderId, fieldErrors } = parseOrderId(formData);
  if (!orderId) return errorState("Invalid order.", fieldErrors);

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "prepared" })
    .eq("id", orderId)
    .eq("pharmacy_id", pharmacyId)
    .eq("status", "accepted")
    .select("order_number")
    .maybeSingle();

  if (error) {
    return errorState(`Could not mark the order prepared: ${error.message}`);
  }
  if (!data) {
    return errorState(
      "Only an accepted order can be marked prepared. Refresh the page to see its current status.",
    );
  }

  revalidatePath("/pharmacy");
  backToQueue(`Order ${data.order_number} is marked prepared.`);
}

/* -------------------------------------------------------------------------- */
/* Prepared -> completed                                                      */
/* -------------------------------------------------------------------------- */

export async function completeOrderAction(
  _previous: PharmacyFormState,
  formData: FormData,
): Promise<PharmacyFormState> {
  const { supabase, profile } = await requireRole("pharmacy_admin");
  const pharmacyId = profile.pharmacy_id;

  if (!pharmacyId) return errorState(NO_PHARMACY);

  const { orderId, fieldErrors } = parseOrderId(formData);
  if (!orderId) return errorState("Invalid order.", fieldErrors);

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "completed" })
    .eq("id", orderId)
    .eq("pharmacy_id", pharmacyId)
    .eq("status", "prepared")
    .select("order_number")
    .maybeSingle();

  if (error) {
    return errorState(`Could not complete the order: ${error.message}`);
  }
  if (!data) {
    return errorState(
      "Only a prepared order can be completed. Refresh the page to see its current status.",
    );
  }

  revalidatePath("/pharmacy");
  backToQueue(`Order ${data.order_number} was marked completed.`);
}

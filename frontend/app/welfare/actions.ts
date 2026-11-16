"use server";

/**
 * Server actions for the welfare-home workspace.
 *
 * Every action re-checks the caller's role and derives the welfare home from
 * `profiles` rather than trusting a hidden form field. All writes still run
 * through the cookie-bound Supabase client, so RLS remains the final authority
 * on tenancy. The order action uses compensating cleanup (delete children while
 * the order is still pending, then cancel) so a failed multi-table insert never
 * leaves an orphaned pending order.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole } from "@/lib/auth/profile";
import type { Database } from "@/lib/types/database";
import type { WelfareFormState } from "@/lib/welfare/form-state";
import type { WelfareTab } from "@/lib/welfare/tabs";
import {
  isUuid,
  parseInventoryForm,
  parseOrderForm,
  parseQuantityAdjustment,
  parseResidentForm,
} from "@/lib/welfare/validation";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function errorState(
  message: string,
  fieldErrors?: Record<string, string>,
): WelfareFormState {
  return { status: "error", message, fieldErrors };
}

function backToTab(tab: WelfareTab, message?: string): never {
  const query = message ? `&notice=${encodeURIComponent(message)}` : "";
  redirect(`/welfare?tab=${tab}${query}`);
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

async function cancelFailedOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<{ cancelled: boolean; detail: string | null }> {
  const problems: string[] = [];

  // Both child delete policies require the parent order to still be pending,
  // so the order is cancelled only after the lines and private links are gone.
  const items = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);
  if (items.error) problems.push(`lines: ${items.error.message}`);

  const links = await supabase
    .from("order_residents")
    .delete()
    .eq("order_id", orderId);
  if (links.error) problems.push(`resident link: ${links.error.message}`);

  const cancelled = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (cancelled.error) problems.push(`cancellation: ${cancelled.error.message}`);

  return {
    cancelled: Boolean(cancelled.data) && !cancelled.error,
    detail: problems.length > 0 ? problems.join("; ") : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Residents                                                                  */
/* -------------------------------------------------------------------------- */

export async function createResidentAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;

  if (!homeId) {
    return errorState(
      "Your profile is not linked to a welfare home. Contact a system administrator.",
    );
  }

  const { values, fieldErrors } = parseResidentForm(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return errorState("Check the highlighted fields.", fieldErrors);
  }

  const { error } = await supabase.from("residents").insert({
    welfare_home_id: homeId,
    ...values,
  });

  if (error) {
    return errorState(
      error.code === "23505"
        ? "A resident with that medical record number already exists in this home."
        : `Could not add the resident: ${error.message}`,
    );
  }

  revalidatePath("/welfare");
  backToTab("residents", `${values.full_name} was added to the resident register.`);
}

export async function updateResidentAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const residentId = text(formData, "resident_id");

  if (!homeId) {
    return errorState(
      "Your profile is not linked to a welfare home. Contact a system administrator.",
    );
  }
  if (!isUuid(residentId)) {
    return errorState("Invalid resident.", {
      resident_id: "Invalid resident.",
    });
  }

  const { values, fieldErrors } = parseResidentForm(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return errorState("Check the highlighted fields.", fieldErrors);
  }

  const { data, error } = await supabase
    .from("residents")
    .update(values)
    .eq("id", residentId)
    .eq("welfare_home_id", homeId)
    .select("id")
    .maybeSingle();

  if (error) {
    return errorState(
      error.code === "23505"
        ? "A resident with that medical record number already exists in this home."
        : `Could not update the resident: ${error.message}`,
    );
  }
  if (!data) {
    return errorState("That resident could not be found in your welfare home.");
  }

  revalidatePath("/welfare");
  backToTab("residents", `${values.full_name} was updated.`);
}

export async function setResidentActiveAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const residentId = text(formData, "resident_id");
  const isActive = text(formData, "is_active") === "true";

  if (!homeId) {
    return errorState("Your profile is not linked to a welfare home.");
  }
  if (!isUuid(residentId)) {
    return errorState("Invalid resident.");
  }

  const { data, error } = await supabase
    .from("residents")
    .update({ is_active: isActive })
    .eq("id", residentId)
    .eq("welfare_home_id", homeId)
    .select("id, full_name")
    .maybeSingle();

  if (error) {
    return errorState(`Could not update the resident: ${error.message}`);
  }
  if (!data) {
    return errorState("That resident could not be found in your welfare home.");
  }

  revalidatePath("/welfare");
  backToTab(
    "residents",
    `${data.full_name} was ${isActive ? "reactivated" : "deactivated"}.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

export async function createInventoryItemAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;

  if (!homeId) {
    return errorState(
      "Your profile is not linked to a welfare home. Contact a system administrator.",
    );
  }

  const { values, fieldErrors } = parseInventoryForm(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return errorState("Check the highlighted fields.", fieldErrors);
  }

  const { error } = await supabase.from("inventory_items").insert({
    welfare_home_id: homeId,
    ...values,
  });

  if (error) {
    return errorState(
      error.code === "23503"
        ? "The selected resident does not belong to this welfare home."
        : `Could not add the stock item: ${error.message}`,
    );
  }

  revalidatePath("/welfare");
  backToTab("inventory", `${values.medication_name} was added to inventory.`);
}

export async function updateInventoryItemAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const itemId = text(formData, "item_id");

  if (!homeId) {
    return errorState(
      "Your profile is not linked to a welfare home. Contact a system administrator.",
    );
  }
  if (!isUuid(itemId)) {
    return errorState("Invalid stock item.", { item_id: "Invalid stock item." });
  }

  const { values, fieldErrors } = parseInventoryForm(formData);
  if (Object.keys(fieldErrors).length > 0) {
    return errorState("Check the highlighted fields.", fieldErrors);
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update(values)
    .eq("id", itemId)
    .eq("welfare_home_id", homeId)
    .select("id")
    .maybeSingle();

  if (error) {
    return errorState(
      error.code === "23503"
        ? "The selected resident does not belong to this welfare home."
        : `Could not update the stock item: ${error.message}`,
    );
  }
  if (!data) {
    return errorState("That stock item could not be found in your welfare home.");
  }

  revalidatePath("/welfare");
  backToTab("inventory", `${values.medication_name} was updated.`);
}

export async function adjustInventoryQuantityAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;

  if (!homeId) {
    return errorState("Your profile is not linked to a welfare home.");
  }

  const { values, fieldErrors } = parseQuantityAdjustment(formData);
  if (!values) {
    return errorState("Check the stock adjustment.", fieldErrors);
  }

  const { data: item, error } = await supabase
    .from("inventory_items")
    .select("id, medication_name, quantity_on_hand, unit")
    .eq("id", values.item_id)
    .eq("welfare_home_id", homeId)
    .maybeSingle();

  if (error) {
    return errorState(`Could not load the stock item: ${error.message}`);
  }
  if (!item) {
    return errorState("That stock item could not be found in your welfare home.");
  }

  const current = Number(item.quantity_on_hand);
  const next =
    values.mode === "dispense"
      ? current - values.amount
      : current + values.amount;

  if (next < 0) {
    return errorState(
      `Cannot dispense ${values.amount} ${item.unit}; only ${current} ${item.unit} are on hand.`,
      { amount: "Amount exceeds the stock on hand." },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("inventory_items")
    .update({ quantity_on_hand: roundToCents(next) })
    .eq("id", values.item_id)
    .eq("welfare_home_id", homeId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return errorState(`Could not adjust the stock: ${updateError.message}`);
  }
  if (!updated) {
    return errorState("That stock item could not be updated.");
  }

  revalidatePath("/welfare");
  backToTab(
    "inventory",
    `${item.medication_name}: ${values.mode === "dispense" ? "dispensed" : "restocked"} ${values.amount} ${item.unit}.`,
  );
}

export async function setInventoryItemActiveAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const itemId = text(formData, "item_id");
  const isActive = text(formData, "is_active") === "true";

  if (!homeId) {
    return errorState("Your profile is not linked to a welfare home.");
  }
  if (!isUuid(itemId)) {
    return errorState("Invalid stock item.");
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update({ is_active: isActive })
    .eq("id", itemId)
    .eq("welfare_home_id", homeId)
    .select("id, medication_name")
    .maybeSingle();

  if (error) {
    return errorState(`Could not update the stock item: ${error.message}`);
  }
  if (!data) {
    return errorState("That stock item could not be found in your welfare home.");
  }

  revalidatePath("/welfare");
  backToTab(
    "inventory",
    `${data.medication_name} was ${isActive ? "reactivated" : "retired"}.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

export async function createOrderAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;

  if (!homeId) {
    return errorState(
      "Your profile is not linked to a welfare home. Contact a system administrator.",
    );
  }

  const { values, fieldErrors } = parseOrderForm(formData);
  if (!values) {
    return errorState("Check the highlighted fields.", fieldErrors);
  }

  const { data: pharmacy, error: pharmacyError } = await supabase
    .from("pharmacies")
    .select("id, name, is_active")
    .eq("id", values.pharmacy_id)
    .maybeSingle();

  if (pharmacyError) {
    return errorState(`Could not load the pharmacy: ${pharmacyError.message}`);
  }
  if (!pharmacy) {
    return errorState("That pharmacy is not available to your welfare home.", {
      pharmacy_id: "Choose a registered pharmacy.",
    });
  }
  if (!pharmacy.is_active) {
    return errorState("That pharmacy is not accepting new orders right now.", {
      pharmacy_id: "Choose an active pharmacy.",
    });
  }

  let resident: {
    id: string;
    full_name: string;
    medical_record_number: string | null;
  } | null = null;

  if (values.resident_id) {
    const { data, error } = await supabase
      .from("residents")
      .select("id, full_name, medical_record_number")
      .eq("id", values.resident_id)
      .maybeSingle();

    if (error) {
      return errorState(`Could not load the resident: ${error.message}`);
    }
    if (!data) {
      return errorState("That resident could not be found in your welfare home.", {
        resident_id: "Choose a resident from your welfare home.",
      });
    }
    resident = data;

    // The bag label is visible to the pharmacy, so refuse to leak identity even
    // when the operator ignores the warning in the drawer.
    if (values.resident_reference) {
      const reference = values.resident_reference.toLowerCase();
      const fullName = resident.full_name.trim().toLowerCase();
      const mrn = resident.medical_record_number?.trim().toLowerCase() ?? "";

      if (
        (fullName.length >= 3 && reference.includes(fullName)) ||
        (mrn.length >= 3 && reference.includes(mrn))
      ) {
        return errorState(
          "The resident reference must not contain the resident's name or medical record number.",
          {
            resident_reference:
              "Use a non-identifying reference such as 'Room 4B'.",
          },
        );
      }
    }
  }

  const inventoryIds = [
    ...new Set(
      values.items
        .map((item) => item.inventory_item_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (inventoryIds.length > 0) {
    const { data: stock, error } = await supabase
      .from("inventory_items")
      .select("id")
      .in("id", inventoryIds);

    if (error) {
      return errorState(`Could not verify the selected stock: ${error.message}`);
    }

    const found = new Set((stock ?? []).map((row) => row.id));
    if (inventoryIds.some((id) => !found.has(id))) {
      return errorState(
        "One or more selected stock items are no longer available. Refresh the page and try again.",
      );
    }
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      welfare_home_id: homeId,
      pharmacy_id: values.pharmacy_id,
      resident_reference: values.resident_reference,
      notes: values.notes,
      status: "pending",
      requested_by: profile.id,
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    const message =
      orderError?.code === "23503"
        ? "The selected pharmacy or resident is no longer available."
        : orderError?.code === "42501"
          ? "This account is not allowed to create an order for this welfare home or pharmacy."
          : `Could not create the order: ${orderError?.message ?? "unknown error"}`;
    return errorState(message);
  }

  try {
    for (const line of values.items) {
      const { data: item, error } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          medication_name: line.medication_name,
          strength: line.strength,
          dosage_form: line.dosage_form,
          unit: line.unit,
          quantity: line.quantity,
          unit_price: line.unit_price,
          notes: line.notes,
        })
        .select("id")
        .single();

      if (error || !item) {
        throw new Error(error?.message ?? "An order line could not be saved.");
      }

      if (line.inventory_item_id) {
        const { error: linkError } = await supabase
          .from("order_item_inventory")
          .insert({
            order_item_id: item.id,
            inventory_item_id: line.inventory_item_id,
          });

        if (linkError) {
          throw new Error(linkError.message);
        }
      }
    }

    if (values.resident_id) {
      const { error: linkError } = await supabase
        .from("order_residents")
        .insert({
          order_id: order.id,
          resident_id: values.resident_id,
        });

      if (linkError) {
        throw new Error(linkError.message);
      }
    }
  } catch (error) {
    const cleanup = await cancelFailedOrder(supabase, order.id);
    const detail = error instanceof Error ? error.message : "Unknown error";

    console.error("Order creation failed", order.id, error, cleanup.detail);

    const suffix = cleanup.cancelled
      ? " The pending order was cancelled, so no draft was left behind."
      : " The pending order could not be cancelled automatically; contact a system administrator.";

    return errorState(`The order could not be completed: ${detail}.${suffix}`);
  }

  revalidatePath("/welfare");
  backToTab(
    "orders",
    `Order ${order.order_number} was submitted to ${pharmacy.name}.`,
  );
}

export async function withdrawOrderAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const orderId = text(formData, "order_id");

  if (!homeId) {
    return errorState("Your profile is not linked to a welfare home.");
  }
  if (!isUuid(orderId)) {
    return errorState("Invalid order.");
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("welfare_home_id", homeId)
    .eq("status", "pending")
    .select("order_number")
    .maybeSingle();

  if (error) {
    return errorState(`Could not withdraw the order: ${error.message}`);
  }
  if (!data) {
    return errorState(
      "Only a pending order can be withdrawn. Refresh the page to see its current status.",
    );
  }

  revalidatePath("/welfare");
  backToTab("orders", `Order ${data.order_number} was withdrawn.`);
}

export async function confirmReceiptAction(
  _previous: WelfareFormState,
  formData: FormData,
): Promise<WelfareFormState> {
  const { supabase, profile } = await requireRole("welfare_admin");
  const homeId = profile.welfare_home_id;
  const orderId = text(formData, "order_id");

  if (!homeId) {
    return errorState("Your profile is not linked to a welfare home.");
  }
  if (!isUuid(orderId)) {
    return errorState("Invalid order.");
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "completed" })
    .eq("id", orderId)
    .eq("welfare_home_id", homeId)
    .eq("status", "prepared")
    .select("order_number")
    .maybeSingle();

  if (error) {
    return errorState(`Could not confirm receipt: ${error.message}`);
  }
  if (!data) {
    return errorState(
      "Only a prepared order can be confirmed as received. Refresh the page to see its current status.",
    );
  }

  revalidatePath("/welfare");
  backToTab("orders", `Order ${data.order_number} was marked as received.`);
}

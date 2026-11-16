/**
 * Read-side queries for the pharmacy fulfilment portal.
 *
 * PHI boundary: this module only touches tables that have a pharmacy_admin RLS
 * policy — `pharmacies`, `orders`, `order_items`, `order_audit_logs` and the
 * requesting `welfare_homes`. It must never query `residents`,
 * `inventory_items`, `order_residents` or `order_item_inventory`; those tables
 * have no pharmacy policy at all, and the portal has no use for them.
 *
 * One-to-many rows are fetched separately and joined in memory so the row
 * shapes stay explicit against the hand-written database types.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  OrderAuditLogRow,
  OrderItemRow,
  OrderRow,
  PharmacyRow,
} from "@/lib/types/database";

export interface PharmacyHomeSummary {
  name: string;
  registration_number: string;
  address: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
}

/** An order as the fulfilling pharmacy may see it: no resident or stock key. */
export interface PharmacyOrder extends OrderRow {
  welfare_home: PharmacyHomeSummary | null;
  items: OrderItemRow[];
  audit_logs: OrderAuditLogRow[];
}

function joinParts(parts: Array<string | null>): string | null {
  const value = parts.filter((part): part is string => Boolean(part)).join(", ");
  return value.length > 0 ? value : null;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const value = key(row);
    const bucket = grouped.get(value);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(value, [row]);
    }
  }

  return grouped;
}

/** The caller's own pharmacy registration/licence record, scoped by RLS. */
export async function getPharmacyProfile(
  supabase: SupabaseClient<Database>,
  pharmacyId: string,
): Promise<PharmacyRow | null> {
  const { data, error } = await supabase
    .from("pharmacies")
    .select("*")
    .eq("id", pharmacyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the pharmacy profile: ${error.message}`);
  }

  return data;
}

export async function listPharmacyOrders(
  supabase: SupabaseClient<Database>,
): Promise<PharmacyOrder[]> {
  const { data: orderRows, error } = await supabase
    .from("orders")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load the order queue: ${error.message}`);
  }

  const orders = orderRows ?? [];
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const homeIds = [
    ...new Set(orders.map((order) => order.welfare_home_id)),
  ];

  const [itemsResult, auditResult, homesResult] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_audit_logs")
      .select("*")
      .in("order_id", orderIds)
      .order("changed_at", { ascending: true }),
    supabase
      .from("welfare_homes")
      .select(
        "id, name, registration_number, address_line1, address_line2, city, region, postal_code, phone, email",
      )
      .in("id", homeIds),
  ]);

  if (itemsResult.error) {
    throw new Error(
      `Could not load the order lines: ${itemsResult.error.message}`,
    );
  }
  if (auditResult.error) {
    throw new Error(
      `Could not load the order audit trail: ${auditResult.error.message}`,
    );
  }
  if (homesResult.error) {
    throw new Error(
      `Could not load the requesting welfare homes: ${homesResult.error.message}`,
    );
  }

  const itemsByOrder = groupBy(
    itemsResult.data ?? [],
    (item) => item.order_id,
  );
  const auditByOrder = groupBy(
    auditResult.data ?? [],
    (log) => log.order_id,
  );
  const homesById = new Map(
    (homesResult.data ?? []).map((home) => [
      home.id,
      {
        name: home.name,
        registration_number: home.registration_number,
        address: joinParts([home.address_line1, home.address_line2]),
        location: joinParts([home.city, home.region, home.postal_code]),
        phone: home.phone,
        email: home.email,
      } satisfies PharmacyHomeSummary,
    ]),
  );

  return orders.map((order) => ({
    ...order,
    welfare_home: homesById.get(order.welfare_home_id) ?? null,
    items: itemsByOrder.get(order.id) ?? [],
    audit_logs: auditByOrder.get(order.id) ?? [],
  }));
}

/**
 * Read-side queries for the welfare-home workspace.
 *
 * Every query runs through the cookie-bound Supabase client as the signed-in
 * welfare administrator, so RLS pins the results to
 * `current_welfare_home_id()`. The one-to-many tables are fetched separately and
 * joined in memory rather than relying on embedded composite-FK relationships;
 * that keeps the row shapes explicit and matches the hand-written database
 * types.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  InventoryItemRow,
  OrderAuditLogRow,
  OrderItemRow,
  OrderRow,
  PharmacyRow,
  ResidentRow,
} from "@/lib/types/database";

export interface InventoryWithResident extends InventoryItemRow {
  resident_name: string | null;
}

/** The stock row a line was drawn from. Tenant-private; never sent to a pharmacy. */
export interface InventoryLinkSummary {
  inventory_item_id: string;
  medication_name: string | null;
  strength: string | null;
}

/**
 * An order line plus its private stock link. `inventory_link` is non-null when
 * the line will be credited back to `inventory_items` on completion.
 */
export interface WelfareOrderItem extends OrderItemRow {
  inventory_link: InventoryLinkSummary | null;
}

/** An order plus the private, tenant-scoped details the pharmacy cannot see. */
export interface WelfareOrder extends OrderRow {
  pharmacy_name: string | null;
  items: WelfareOrderItem[];
  resident_id: string | null;
  resident_name: string | null;
  audit_logs: OrderAuditLogRow[];
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

export async function listResidents(
  supabase: SupabaseClient<Database>,
  options?: { activeOnly?: boolean },
): Promise<ResidentRow[]> {
  const query = supabase
    .from("residents")
    .select("*")
    .order("is_active", { ascending: false })
    .order("full_name", { ascending: true });

  const { data, error } = options?.activeOnly
    ? await query.eq("is_active", true)
    : await query;

  if (error) {
    throw new Error(`Could not load residents: ${error.message}`);
  }

  return data ?? [];
}

export async function listInventory(
  supabase: SupabaseClient<Database>,
): Promise<InventoryWithResident[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .order("medication_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load inventory: ${error.message}`);
  }

  const rows = data ?? [];
  const residentIds = [
    ...new Set(
      rows
        .map((row) => row.resident_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string>();
  if (residentIds.length > 0) {
    const { data: residents, error: residentError } = await supabase
      .from("residents")
      .select("id, full_name")
      .in("id", residentIds);

    if (residentError) {
      throw new Error(
        `Could not load resident names for inventory: ${residentError.message}`,
      );
    }

    for (const resident of residents ?? []) {
      names.set(resident.id, resident.full_name);
    }
  }

  return rows.map((row) => ({
    ...row,
    resident_name: row.resident_id
      ? (names.get(row.resident_id) ?? null)
      : null,
  }));
}

/**
 * All pharmacies visible to this welfare home: active suppliers plus any
 * pharmacy it already ordered from (so historical orders keep their names).
 */
export async function listVisiblePharmacies(
  supabase: SupabaseClient<Database>,
): Promise<PharmacyRow[]> {
  const { data, error } = await supabase
    .from("pharmacies")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load pharmacies: ${error.message}`);
  }

  return data ?? [];
}

async function residentNames(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("residents")
    .select("id, full_name")
    .in("id", ids);

  if (error) {
    throw new Error(`Could not load resident names: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

async function pharmacyNames(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("pharmacies")
    .select("id, name")
    .in("id", ids);

  if (error) {
    throw new Error(`Could not load pharmacy names: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

export async function listOrders(
  supabase: SupabaseClient<Database>,
): Promise<WelfareOrder[]> {
  const { data: orderRows, error } = await supabase
    .from("orders")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load orders: ${error.message}`);
  }

  const orders = orderRows ?? [];
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);

  const [itemsResult, residentLinksResult, auditResult] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_residents")
      .select("order_id, resident_id")
      .in("order_id", orderIds),
    supabase
      .from("order_audit_logs")
      .select("*")
      .in("order_id", orderIds)
      .order("changed_at", { ascending: true }),
  ]);

  if (itemsResult.error) {
    throw new Error(`Could not load order lines: ${itemsResult.error.message}`);
  }
  if (residentLinksResult.error) {
    throw new Error(
      `Could not load resident links for orders: ${residentLinksResult.error.message}`,
    );
  }
  if (auditResult.error) {
    throw new Error(
      `Could not load the order audit trail: ${auditResult.error.message}`,
    );
  }

  const itemRows = itemsResult.data ?? [];
  const itemIds = itemRows.map((item) => item.id);

  const stockLinks: Array<{
    order_item_id: string;
    inventory_item_id: string;
  }> = [];

  if (itemIds.length > 0) {
    const { data, error: stockLinkError } = await supabase
      .from("order_item_inventory")
      .select("order_item_id, inventory_item_id")
      .in("order_item_id", itemIds);

    if (stockLinkError) {
      throw new Error(
        `Could not load the inventory links for order lines: ${stockLinkError.message}`,
      );
    }

    stockLinks.push(...(data ?? []));
  }

  const stockIds = [
    ...new Set(stockLinks.map((link) => link.inventory_item_id)),
  ];
  const stockRows = new Map<
    string,
    { medication_name: string; strength: string | null }
  >();

  if (stockIds.length > 0) {
    const { data, error: stockError } = await supabase
      .from("inventory_items")
      .select("id, medication_name, strength")
      .in("id", stockIds);

    if (stockError) {
      throw new Error(
        `Could not load the linked inventory rows: ${stockError.message}`,
      );
    }

    for (const row of data ?? []) {
      stockRows.set(row.id, {
        medication_name: row.medication_name,
        strength: row.strength,
      });
    }
  }

  const inventoryByItem = new Map(
    stockLinks.map((link) => [link.order_item_id, link.inventory_item_id]),
  );

  const itemsWithLinks: WelfareOrderItem[] = itemRows.map((item) => {
    const inventoryItemId = inventoryByItem.get(item.id);

    if (!inventoryItemId) {
      return { ...item, inventory_link: null };
    }

    const stock = stockRows.get(inventoryItemId);

    return {
      ...item,
      inventory_link: {
        inventory_item_id: inventoryItemId,
        medication_name: stock?.medication_name ?? null,
        strength: stock?.strength ?? null,
      },
    };
  });

  const itemsByOrder = groupBy(itemsWithLinks, (item) => item.order_id);
  const auditByOrder = groupBy(
    auditResult.data ?? [],
    (log) => log.order_id,
  );
  const residentByOrder = new Map(
    (residentLinksResult.data ?? []).map((link) => [
      link.order_id,
      link.resident_id,
    ]),
  );

  const [residentMap, pharmacyMap] = await Promise.all([
    residentNames(
      supabase,
      [...new Set(residentByOrder.values())],
    ),
    pharmacyNames(
      supabase,
      [...new Set(orders.map((order) => order.pharmacy_id))],
    ),
  ]);

  return orders.map((order) => {
    const residentId = residentByOrder.get(order.id) ?? null;

    return {
      ...order,
      pharmacy_name: pharmacyMap.get(order.pharmacy_id) ?? null,
      items: itemsByOrder.get(order.id) ?? [],
      resident_id: residentId,
      resident_name: residentId
        ? (residentMap.get(residentId) ?? null)
        : null,
      audit_logs: auditByOrder.get(order.id) ?? [],
    };
  });
}

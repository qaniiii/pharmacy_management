/**
 * Pure helpers for the hybrid inventory view.
 *
 * The database owns stock quantity; these helpers only decide how the UI
 * highlights a row. They are safe to call from both server and client
 * components because they take an explicit `now` for date comparisons.
 */

import type { InventoryItemRow } from "@/lib/types/database";

/** A batch inside this window is highlighted as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 30;

type StockLevel = Pick<InventoryItemRow, "quantity_on_hand" | "reorder_level">;

export function isLowStock(item: StockLevel): boolean {
  return Number(item.quantity_on_hand) <= Number(item.reorder_level);
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** Classifies an ISO `date` string against the supplied day (UTC). */
export function expiryState(
  expiryDate: string | null,
  now: Date = new Date(),
): ExpiryState {
  if (!expiryDate) return "none";

  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return "none";

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const days = Math.floor((expiry.getTime() - today) / 86_400_000);

  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "soon";
  return "ok";
}

/** Whole days until a batch expires; negative when already expired. */
export function daysUntilExpiry(
  expiryDate: string,
  now: Date = new Date(),
): number {
  const expiry = new Date(`${expiryDate}T00:00:00Z`);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((expiry.getTime() - today) / 86_400_000);
}

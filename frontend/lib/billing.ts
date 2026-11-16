/**
 * Shared billing-statement logic for the welfare and pharmacy workspaces.
 *
 * The builders only ever consume rows the caller already loaded under RLS:
 * completed orders plus their lines. The welfare builder additionally receives
 * the private resident link, which is never loaded by the pharmacy portal.
 *
 * CSV output follows RFC 4180: comma-separated records terminated by CRLF,
 * fields containing a comma, quote, CR or LF wrapped in double quotes, and
 * embedded quotes doubled. Numeric values are written with a plain decimal
 * point (no locale grouping) so spreadsheets parse them as numbers.
 */

import type { PharmacyOrder } from "@/lib/pharmacy/data";
import type { WelfareOrder } from "@/lib/welfare/data";

export type BillingVariant = "welfare" | "pharmacy";

export interface BillingLine {
  order_id: string;
  order_number: string;
  /** UTC ISO timestamp of the completed transition. */
  completed_at: string;
  welfare_home: string;
  resident_reference: string | null;
  /** Welfare-only: the private resident name linked in order_residents. */
  linked_resident: string | null;
  medication: string;
  strength_form: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  order_total: number;
}

export interface BillingSummary {
  /** Distinct completed orders represented by the lines. */
  orderCount: number;
  lineCount: number;
  grandTotal: number;
}

export interface BillingColumn {
  header: string;
  value: (line: BillingLine) => string;
  numeric?: boolean;
}

function strengthForm(
  strength: string | null,
  dosageForm: string | null,
): string {
  const value = [strength, dosageForm]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return value.length > 0 ? value : "—";
}

/** Plain decimal with at most two places, e.g. 30, 12.5, 0.25. */
export function trimNumber(value: number): string {
  const fixed = Number(value).toFixed(2);
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function quantityText(line: BillingLine): string {
  const quantity = trimNumber(line.quantity);
  return line.unit ? `${quantity} ${line.unit}` : quantity;
}

/**
 * Pharmacy statement: no resident name, no resident id and no stock key. The
 * only resident-related value is the non-identifying bag reference.
 */
export function buildPharmacyBillingLines(
  orders: PharmacyOrder[],
): BillingLine[] {
  const lines: BillingLine[] = [];

  for (const order of orders) {
    if (order.status !== "completed" || !order.completed_at) continue;

    const welfareHome = order.welfare_home?.name ?? "Welfare home unavailable";

    for (const item of order.items) {
      lines.push({
        order_id: order.id,
        order_number: order.order_number,
        completed_at: order.completed_at,
        welfare_home: welfareHome,
        resident_reference: order.resident_reference,
        linked_resident: null,
        medication: item.medication_name,
        strength_form: strengthForm(item.strength, item.dosage_form),
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        line_total: item.line_total,
        order_total: order.total_amount,
      });
    }
  }

  return lines;
}

/**
 * Welfare statement: the same billing columns plus the private resident name
 * from order_residents for internal home accounting.
 */
export function buildWelfareBillingLines(
  orders: WelfareOrder[],
  welfareHomeName: string,
): BillingLine[] {
  const lines: BillingLine[] = [];

  for (const order of orders) {
    if (order.status !== "completed" || !order.completed_at) continue;

    const linkedResident = order.resident_id
      ? (order.resident_name ?? "Linked resident unavailable")
      : null;

    for (const item of order.items) {
      lines.push({
        order_id: order.id,
        order_number: order.order_number,
        completed_at: order.completed_at,
        welfare_home: welfareHomeName,
        resident_reference: order.resident_reference,
        linked_resident: linkedResident,
        medication: item.medication_name,
        strength_form: strengthForm(item.strength, item.dosage_form),
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        line_total: item.line_total,
        order_total: order.total_amount,
      });
    }
  }

  return lines;
}

/** Inclusive YYYY-MM-DD range over the UTC completion date. */
export function filterBillingLines(
  lines: BillingLine[],
  start: string,
  end: string,
): BillingLine[] {
  if (start && end && start > end) return [];

  return lines
    .filter((line) => {
      const completedDate = line.completed_at.slice(0, 10);
      if (start && completedDate < start) return false;
      if (end && completedDate > end) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.completed_at.localeCompare(b.completed_at) ||
        a.order_number.localeCompare(b.order_number),
    );
}

export function summarizeBilling(lines: BillingLine[]): BillingSummary {
  const orderTotals = new Map<string, number>();

  for (const line of lines) {
    orderTotals.set(line.order_id, line.order_total);
  }

  let grandTotal = 0;
  for (const total of orderTotals.values()) {
    grandTotal += Number(total);
  }

  return {
    orderCount: orderTotals.size,
    lineCount: lines.length,
    grandTotal,
  };
}

export function billingColumns(variant: BillingVariant): BillingColumn[] {
  const columns: BillingColumn[] = [
    { header: "Order Number", value: (line) => line.order_number },
    {
      header: "Completed Date",
      value: (line) => line.completed_at.slice(0, 10),
    },
    { header: "Welfare Home", value: (line) => line.welfare_home },
    {
      header: "Bag Reference",
      value: (line) => line.resident_reference ?? "",
    },
  ];

  if (variant === "welfare") {
    columns.push({
      header: "Linked Resident",
      value: (line) => line.linked_resident ?? "",
    });
  }

  columns.push(
    { header: "Medication", value: (line) => line.medication },
    { header: "Strength / Form", value: (line) => line.strength_form },
    {
      header: "Quantity",
      value: quantityText,
      numeric: true,
    },
    {
      header: "Unit Price",
      value: (line) => Number(line.unit_price).toFixed(2),
      numeric: true,
    },
    {
      header: "Line Total",
      value: (line) => Number(line.line_total).toFixed(2),
      numeric: true,
    },
    {
      header: "Order Total",
      value: (line) => Number(line.order_total).toFixed(2),
      numeric: true,
    },
  );

  return columns;
}

/** RFC 4180 field escaping. */
export function escapeCsvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildBillingCsv(
  lines: BillingLine[],
  variant: BillingVariant,
): string {
  const columns = billingColumns(variant);
  const records: string[] = [
    columns.map((column) => escapeCsvValue(column.header)).join(","),
  ];

  for (const line of lines) {
    records.push(
      columns
        .map((column) => escapeCsvValue(column.value(line)))
        .join(","),
    );
  }

  // RFC 4180 records end with CRLF; the final one is included for consistency.
  return `${records.join("\r\n")}\r\n`;
}

export function billingFileName(
  variant: BillingVariant,
  start: string,
  end: string,
): string {
  const period =
    start || end ? `${start || "start"}-to-${end || "end"}` : "all-completed";

  return `${variant}-billing-${period.replace(/[^0-9A-Za-z._-]/g, "-")}.csv`;
}

/**
 * Locale-stable formatting helpers shared by the tenant workspaces.
 *
 * A fixed locale and UTC time zone keep server-rendered markup identical to the
 * first client render, which avoids React hydration warnings.
 */

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const AMOUNT_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const QUANTITY_FORMAT = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMAT.format(date);
}

export function formatAmount(value: number): string {
  return AMOUNT_FORMAT.format(Number(value));
}

export function formatQuantity(value: number, unit: string): string {
  return `${QUANTITY_FORMAT.format(Number(value))} ${unit}`;
}

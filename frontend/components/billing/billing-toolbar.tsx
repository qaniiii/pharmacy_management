"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { INPUT_CLASS } from "@/components/admin/form-field";
import {
  billingColumns,
  billingFileName,
  buildBillingCsv,
  filterBillingLines,
  summarizeBilling,
  type BillingColumn,
  type BillingLine,
  type BillingVariant,
} from "@/lib/billing";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatQuantity,
} from "@/lib/format";

const DATE_INPUT_CLASS = `${INPUT_CLASS} h-9`;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function statementValue(column: BillingColumn, line: BillingLine): string {
  switch (column.header) {
    case "Completed Date":
      return formatDate(line.completed_at.slice(0, 10));
    case "Quantity":
      return formatQuantity(line.quantity, line.unit);
    case "Unit Price":
      return formatAmount(line.unit_price);
    case "Line Total":
      return formatAmount(line.line_total);
    case "Order Total":
      return formatAmount(line.order_total);
    case "Bag Reference":
      return line.resident_reference ?? "—";
    case "Linked Resident":
      return line.linked_resident ?? "—";
    default:
      return column.value(line) || "—";
  }
}

/**
 * Month-end statement toolbar shared by the welfare and pharmacy order views.
 *
 * The parent passes only completed orders it has already loaded under RLS. The
 * date range is inclusive over the UTC completion date, and both the CSV and
 * the printed statement are generated entirely in the browser from that same
 * in-memory data set.
 */
export function BillingToolbar({
  variant,
  organisationName,
  organisationDetail,
  lines,
}: {
  variant: BillingVariant;
  organisationName: string;
  organisationDetail?: string;
  lines: BillingLine[];
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [statementOpen, setStatementOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const invalidRange = Boolean(start && end && start > end);
  const filtered = useMemo(
    () => (invalidRange ? [] : filterBillingLines(lines, start, end)),
    [lines, start, end, invalidRange],
  );
  const summary = summarizeBilling(filtered);
  const columns = billingColumns(variant);

  const periodLabel =
    !start && !end
      ? "All completed orders"
      : `${start ? formatDate(start) : "Start"} – ${
          end ? formatDate(end) : "End"
        }`;

  useEffect(() => {
    if (!statementOpen) return;

    document.body.classList.add("billing-print-open");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatementOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("billing-print-open");
    };
  }, [statementOpen]);

  function openStatement() {
    setGeneratedAt(new Date().toISOString());
    setStatementOpen(true);
  }

  function handleDownload() {
    downloadCsv(
      billingFileName(variant, start, end),
      buildBillingCsv(filtered, variant),
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Month-end billing &amp; audit statement
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">
            Completed orders only. Choose a period, then download the CSV or
            open a print-ready statement for month-end reconciliation.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
            variant === "pharmacy"
              ? "bg-sky-50 text-sky-700 ring-sky-200"
              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
          }`}
        >
          {variant === "pharmacy"
            ? "Zero PHI · bag reference only"
            : "Internal accounting · includes linked residents"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Start Date</span>
          <input
            type="date"
            value={start}
            max={end || undefined}
            onChange={(event) => setStart(event.target.value)}
            className={`mt-1 w-full ${DATE_INPUT_CLASS}`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">End Date</span>
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(event) => setEnd(event.target.value)}
            className={`mt-1 w-full ${DATE_INPUT_CLASS}`}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setStart(monthStartIso());
              setEnd(todayIso());
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => {
              setStart("");
              setEnd("");
            }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Clear
          </button>
        </div>
        <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
          <button
            type="button"
            onClick={handleDownload}
            disabled={filtered.length === 0}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={openStatement}
            disabled={filtered.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Print / PDF
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs">
        <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-inset ring-slate-200">
          Fulfilled orders{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {summary.orderCount}
          </span>
        </span>
        <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-inset ring-slate-200">
          Line items{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {summary.lineCount}
          </span>
        </span>
        <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-inset ring-slate-200">
          Statement total{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatAmount(summary.grandTotal)}
          </span>
        </span>
        <span className="text-slate-500">{periodLabel}</span>
      </div>

      {invalidRange ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          The start date must be on or before the end date.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          No completed orders fall inside this period.
        </p>
      ) : null}

      {statementOpen ? createPortal(
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStatementOpen(false);
          }}
          className="billing-print-root fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 sm:p-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-statement-title"
            className="mx-auto w-full max-w-7xl"
          >
            <div className="print-toolbar mb-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatementOpen(false)}
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
              >
                Print / Save as PDF
              </button>
            </div>

            <article className="print-statement rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-4">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Billing &amp; audit statement
                  </p>
                  <h3
                    id="billing-statement-title"
                    className="mt-1 text-xl font-semibold tracking-tight text-slate-900"
                  >
                    {organisationName}
                  </h3>
                  {organisationDetail ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {organisationDetail}
                    </p>
                  ) : null}
                </div>
                <dl className="text-right text-xs text-slate-600">
                  <div>
                    <dt className="inline font-medium text-slate-700">
                      Period:
                    </dt>{" "}
                    <dd className="inline">{periodLabel}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-700">
                      Generated:
                    </dt>{" "}
                    <dd className="inline">
                      {generatedAt ? formatDateTime(generatedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-700">
                      Scope:
                    </dt>{" "}
                    <dd className="inline">Completed orders</dd>
                  </div>
                </dl>
              </header>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Fulfilled orders</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                    {summary.orderCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Line items</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                    {summary.lineCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Statement total</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                    {formatAmount(summary.grandTotal)}
                  </p>
                </div>
              </div>

              <div className="print-table-wrap mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-50 text-[0.6rem] uppercase tracking-wide text-slate-600">
                      {columns.map((column) => (
                        <th
                          key={column.header}
                          scope="col"
                          className={`whitespace-nowrap px-2 py-2 font-semibold ${
                            column.numeric ? "text-right" : ""
                          }`}
                        >
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((line, index) => (
                      <tr
                        key={`${line.order_id}-${line.medication}-${index}`}
                        className="border-b border-slate-200 align-top"
                      >
                        {columns.map((column) => (
                          <td
                            key={column.header}
                            className={`px-2 py-2 ${
                              column.numeric
                                ? "whitespace-nowrap text-right tabular-nums"
                                : ""
                            }`}
                          >
                            {statementValue(column, line)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="mt-4 border-t border-slate-300 pt-3 text-[0.65rem] leading-5 text-slate-500">
                {variant === "pharmacy" ? (
                  <p>
                    This statement contains no resident names, dates of birth or
                    medical record numbers. Bag references are non-identifying
                    labels supplied by the welfare home.
                  </p>
                ) : (
                  <p>
                    Internal welfare-home statement. Linked resident names come
                    from the private order_residents table and are never shared
                    with the pharmacy.
                  </p>
                )}
                <p className="mt-1">
                  Generated from completed orders only; totals reflect the
                  stored order values.
                </p>
              </footer>
            </article>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

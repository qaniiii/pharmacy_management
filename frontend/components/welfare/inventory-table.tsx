"use client";

import { useMemo, useState } from "react";

import { setInventoryItemActiveAction } from "@/app/welfare/actions";
import { ToggleForm } from "@/components/admin/toggle-form";
import { InventoryEditor } from "@/components/welfare/inventory-editor";
import { QuantityAdjustForm } from "@/components/welfare/quantity-adjust-form";
import type { ResidentRow } from "@/lib/types/database";
import type { InventoryWithResident } from "@/lib/welfare/data";
import { formatDate, formatQuantity } from "@/lib/format";
import {
  daysUntilExpiry,
  expiryState,
  isLowStock,
} from "@/lib/welfare/inventory";

const TABLE_CLASS = "min-w-full divide-y divide-slate-200 text-sm";
const HEAD_CLASS =
  "bg-slate-50/80 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500";
const HEAD_CELL_CLASS = "whitespace-nowrap px-4 py-2.5";
const CELL_CLASS = "px-4 py-3 align-top";

type StockFilter = "all" | "pooled" | "resident";

const STOCK_FILTERS: ReadonlyArray<{ id: StockFilter; label: string }> = [
  { id: "all", label: "All stock" },
  { id: "pooled", label: "General pooled" },
  { id: "resident", label: "Resident-specific" },
];

function AttentionBadges({ item }: { item: InventoryWithResident }) {
  const expiry = expiryState(item.expiry_date);
  const low = isLowStock(item);

  return (
    <div className="flex flex-wrap gap-1">
      {low ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          Low stock
        </span>
      ) : null}
      {expiry === "expired" ? (
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.7rem] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
          Expired
        </span>
      ) : null}
      {expiry === "soon" && item.expiry_date ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.7rem] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          Expires in {daysUntilExpiry(item.expiry_date)} d
        </span>
      ) : null}
      {!low && expiry !== "expired" && expiry !== "soon" ? (
        <span className="text-xs text-slate-400">—</span>
      ) : null}
    </div>
  );
}

export function InventoryTable({
  rows,
  residents,
}: {
  rows: InventoryWithResident[];
  residents: ResidentRow[];
}) {
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [search, setSearch] = useState("");

  const pooledCount = rows.filter((row) => row.resident_id === null).length;
  const residentCount = rows.length - pooledCount;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (stockFilter === "pooled" && row.resident_id !== null) return false;
      if (stockFilter === "resident" && row.resident_id === null) return false;

      if (attentionOnly) {
        const expiry = expiryState(row.expiry_date);
        if (
          !isLowStock(row) &&
          expiry !== "expired" &&
          expiry !== "soon"
        ) {
          return false;
        }
      }

      if (!query) return true;

      return [
        row.medication_name,
        row.generic_name,
        row.strength,
        row.dosage_form,
        row.batch_number,
        row.storage_location,
        row.resident_name,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [rows, stockFilter, attentionOnly, search]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Stock</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} lines · {pooledCount} pooled · {residentCount}{" "}
            resident-specific ·{" "}
            {rows.filter((row) => isLowStock(row)).length} at or below reorder
            level
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search medication, batch, resident…"
            aria-label="Search stock"
            className="w-56 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={attentionOnly}
              onChange={(event) => setAttentionOnly(event.target.checked)}
              className="size-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            Needs attention
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-5 py-2.5">
        {STOCK_FILTERS.map((filter) => {
          const active = stockFilter === filter.id;
          const count =
            filter.id === "all"
              ? rows.length
              : filter.id === "pooled"
                ? pooledCount
                : residentCount;

          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStockFilter(filter.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {filter.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums ${
                  active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead className={HEAD_CLASS}>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Medication
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Allocation
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Quantity
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Batch / expiry
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Attention
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Location
              </th>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {rows.length === 0
                    ? "No stock yet. Add a pooled or resident-specific item to get started."
                    : "No stock items match these filters."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const low = isLowStock(row);
                const expiry = expiryState(row.expiry_date);
                const tone =
                  expiry === "expired"
                    ? "bg-rose-50/50"
                    : low || expiry === "soon"
                      ? "bg-amber-50/40"
                      : "hover:bg-slate-50/60";

                return (
                  <tr key={row.id} className={tone}>
                    <td className={CELL_CLASS}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">
                          {row.medication_name}
                        </p>
                        {row.is_active ? null : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                            Retired
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[row.generic_name, row.strength, row.dosage_form]
                          .filter(Boolean)
                          .join(" · ") || "No formulation details"}
                      </p>
                    </td>
                    <td className={CELL_CLASS}>
                      {row.resident_id === null ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[0.7rem] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                          General pooled stock
                        </span>
                      ) : (
                        <div>
                          <p className="text-xs font-medium text-slate-800">
                            {row.resident_name ?? "Unknown resident"}
                          </p>
                          <p className="mt-0.5 text-[0.7rem] text-slate-500">
                            Resident-specific prescription stock
                          </p>
                        </div>
                      )}
                    </td>
                    <td className={CELL_CLASS}>
                      <p className="font-medium tabular-nums text-slate-900">
                        {formatQuantity(row.quantity_on_hand, row.unit)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Reorder at {formatQuantity(row.reorder_level, row.unit)}
                      </p>
                    </td>
                    <td className={CELL_CLASS}>
                      <p className="font-mono text-xs text-slate-600">
                        {row.batch_number ?? "No batch"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.expiry_date
                          ? `Expires ${formatDate(row.expiry_date)}`
                          : "No expiry recorded"}
                      </p>
                    </td>
                    <td className={CELL_CLASS}>
                      <AttentionBadges item={row} />
                    </td>
                    <td className={CELL_CLASS}>
                      <p className="max-w-44 text-xs text-slate-600">
                        {row.storage_location ?? "—"}
                      </p>
                    </td>
                    <td className={`${CELL_CLASS} text-right`}>
                      <div className="flex flex-col items-end gap-2">
                        <InventoryEditor
                          mode="edit"
                          item={row}
                          residents={residents}
                          triggerLabel="Edit"
                        />
                        <QuantityAdjustForm
                          itemId={row.id}
                          label={row.medication_name}
                        />
                        <ToggleForm
                          action={setInventoryItemActiveAction}
                          fields={{
                            item_id: row.id,
                            is_active: String(!row.is_active),
                          }}
                          label={row.is_active ? "Retire" : "Reactivate"}
                          pendingLabel="Saving…"
                          tone={row.is_active ? "danger" : "success"}
                          confirmMessage={
                            row.is_active
                              ? `Retire ${row.medication_name}? It will stop appearing in the ordering drawer.`
                              : undefined
                          }
                          srDescription={`${row.is_active ? "Retire" : "Reactivate"} ${row.medication_name}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

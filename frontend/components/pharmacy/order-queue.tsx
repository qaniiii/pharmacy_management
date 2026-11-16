"use client";

import { useMemo, useState } from "react";

import { BillingToolbar } from "@/components/billing/billing-toolbar";
import { PharmacyOrderCard } from "@/components/pharmacy/order-card";
import { buildPharmacyBillingLines } from "@/lib/billing";
import type { OrderStatus } from "@/lib/types/database";
import type { PharmacyOrder } from "@/lib/pharmacy/data";

const STATUS_FILTERS: ReadonlyArray<{
  id: OrderStatus | "all";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "prepared", label: "Prepared" },
  { id: "completed", label: "Completed" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export function PharmacyOrderQueue({
  orders,
  organisationName,
  organisationDetail,
}: {
  orders: PharmacyOrder[];
  organisationName: string;
  organisationDetail?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const billingLines = useMemo(
    () => buildPharmacyBillingLines(orders),
    [orders],
  );

  const counts = orders.reduce<Record<string, number>>((accumulator, order) => {
    accumulator[order.status] = (accumulator[order.status] ?? 0) + 1;
    return accumulator;
  }, {});

  const filtered =
    statusFilter === "all"
      ? orders
      : orders.filter((order) => order.status === statusFilter);

  return (
    <div className="space-y-4">
      <BillingToolbar
        variant="pharmacy"
        organisationName={organisationName}
        organisationDetail={organisationDetail}
        lines={billingLines}
      />

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.id;
          const count =
            filter.id === "all" ? orders.length : (counts[filter.id] ?? 0);

          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={active}
              onClick={() => setStatusFilter(filter.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {orders.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">No orders yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Orders sent to this pharmacy by its welfare homes will appear here.
          </p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">
            No orders in this status
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Choose another status or clear the filter.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <PharmacyOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

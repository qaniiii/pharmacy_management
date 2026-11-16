"use client";

import { useMemo, useState } from "react";

import {
  confirmReceiptAction,
  withdrawOrderAction,
} from "@/app/welfare/actions";
import { ToggleForm } from "@/components/admin/toggle-form";
import { BillingToolbar } from "@/components/billing/billing-toolbar";
import {
  ORDER_STATUS_LABELS,
  OrderStatusBadge,
} from "@/components/orders/order-status-badge";
import { isUserRole, ROLE_LABELS } from "@/lib/auth/roles";
import { buildWelfareBillingLines } from "@/lib/billing";
import type {
  OrderAuditLogRow,
  OrderStatus,
} from "@/lib/types/database";
import type {
  InventoryLinkSummary,
  WelfareOrder,
} from "@/lib/welfare/data";
import {
  formatAmount,
  formatDateTime,
  formatQuantity,
} from "@/lib/format";

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

function metadataString(
  log: OrderAuditLogRow,
  key: string,
): string | null {
  const metadata = log.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function auditLabel(log: OrderAuditLogRow): string {
  if (log.from_status === null) {
    return "Order submitted";
  }
  return `${ORDER_STATUS_LABELS[log.from_status]} → ${ORDER_STATUS_LABELS[log.to_status]}`;
}

function auditActor(log: OrderAuditLogRow): string | null {
  const role = metadataString(log, "actor_role");
  if (!role) return null;
  return isUserRole(role) ? ROLE_LABELS[role] : role;
}

/**
 * Subtle per-line note showing whether the line is linked to a stock row and
 * what completion will do with it. The link itself is tenant-private data.
 */
function RestockIndicator({
  status,
  link,
}: {
  status: OrderStatus;
  link: InventoryLinkSummary;
}) {
  const stockLabel =
    [link.medication_name, link.strength].filter(Boolean).join(" · ") ||
    "linked stock row";

  if (status === "completed") {
    return (
      <span
        title={`Restocked to ${stockLabel} on completion`}
        className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
      >
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-emerald-500"
        />
        Reconciled on completion
      </span>
    );
  }
  if (status === "prepared") {
    return (
      <span
        title={`Will be restocked to ${stockLabel} when the order completes`}
        className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-sky-700 ring-1 ring-inset ring-sky-200"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-sky-500" />
        Auto-restocks on completion
      </span>
    );
  }

  if (status === "cancelled" || status === "rejected") {
    return (
      <span
        title={`Linked to ${stockLabel}; this order closed without restocking`}
        className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-500 ring-1 ring-inset ring-slate-200"
      >
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-slate-400"
        />
        Stock link · no restock
      </span>
    );
  }

  return (
    <span
      title={`Linked to ${stockLabel}`}
      className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-slate-400" />
      Linked to inventory
    </span>
  );
}

function OrderCard({ order }: { order: WelfareOrder }) {
  const rejectionReason =
    order.rejection_reason ??
    order.audit_logs
      .map((log) => metadataString(log, "rejection_reason"))
      .find((value): value is string => Boolean(value)) ??
    null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm font-semibold text-slate-900">
              {order.order_number}
            </h3>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {order.pharmacy_name ?? "Unknown pharmacy"} · submitted{" "}
            {formatDateTime(order.submitted_at)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {formatAmount(order.total_amount)}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-slate-600">Resident:</dt>{" "}
          <dd className="inline text-slate-600">
            {order.resident_id
              ? (order.resident_name ?? "Linked resident unavailable")
              : "No resident linked"}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-slate-600">Bag reference:</dt>{" "}
          <dd className="inline text-slate-600">
            {order.resident_reference ?? "—"}
          </dd>
        </div>
      </dl>

      {order.status === "rejected" && rejectionReason ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="font-semibold">Rejected:</span> {rejectionReason}
        </p>
      ) : null}

      {order.notes ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <span className="font-medium text-slate-700">Notes:</span>{" "}
          {order.notes}
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50/80 text-left text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">
                Medication
              </th>
              <th scope="col" className="px-3 py-2">
                Quantity
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Unit price
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Line total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-slate-500"
                >
                  No medication lines were recorded.
                </td>
              </tr>
            ) : (
              order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-slate-800">
                      {item.medication_name}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {[item.strength, item.dosage_form]
                        .filter(Boolean)
                        .join(" · ") || "No formulation details"}
                    </p>
                    {item.notes ? (
                      <p className="mt-0.5 text-slate-500">{item.notes}</p>
                    ) : null}
                    {item.inventory_link ? (
                      <div>
                        <RestockIndicator
                          status={order.status}
                          link={item.inventory_link}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-700">
                    {formatQuantity(item.quantity, item.unit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-right tabular-nums text-slate-700">
                    {formatAmount(item.unit_price)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-right font-medium tabular-nums text-slate-900">
                    {formatAmount(item.line_total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {order.items.some((item) => item.inventory_link) ? (
        <p className="mt-2 text-[0.65rem] leading-4 text-slate-500">
          Stock-linked lines are credited back to inventory automatically when a
          prepared order is completed.
        </p>
      ) : null}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Audit timeline
        </h4>
        {order.audit_logs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No audit entries are visible for this order.
          </p>
        ) : (
          <ol className="mt-2 space-y-2 border-l border-slate-200 pl-4">
            {order.audit_logs.map((log) => {
              const actor = auditActor(log);
              const reason = metadataString(log, "rejection_reason");

              return (
                <li key={log.id} className="relative text-xs text-slate-600">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.32rem] top-1 size-2 rounded-full bg-slate-300 ring-2 ring-white"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">
                      {auditLabel(log)}
                    </span>
                    <span className="text-slate-400">
                      {formatDateTime(log.changed_at)}
                    </span>
                    {actor ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.65rem] text-slate-600 ring-1 ring-inset ring-slate-200">
                        {actor}
                      </span>
                    ) : null}
                  </div>
                  {reason ? (
                    <p className="mt-0.5 text-rose-700">
                      <span className="font-medium">Reason:</span> {reason}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {order.status === "pending" || order.status === "prepared" ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          {order.status === "pending" ? (
            <ToggleForm
              action={withdrawOrderAction}
              fields={{ order_id: order.id }}
              label="Withdraw"
              pendingLabel="Withdrawing…"
              tone="danger"
              confirmMessage="Withdraw this pending order? The pharmacy will no longer see it."
              srDescription={`Withdraw order ${order.order_number}`}
            />
          ) : null}
          {order.status === "prepared" ? (
            <ToggleForm
              action={confirmReceiptAction}
              fields={{ order_id: order.id }}
              label="Confirm receipt"
              pendingLabel="Confirming…"
              tone="success"
              confirmMessage="Confirm that the medication has been received? This closes the order."
              srDescription={`Confirm receipt for order ${order.order_number}`}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function OrderHistory({
  orders,
  organisationName,
  organisationDetail,
}: {
  orders: WelfareOrder[];
  organisationName: string;
  organisationDetail?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const billingLines = useMemo(
    () => buildWelfareBillingLines(orders, organisationName),
    [orders, organisationName],
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
        variant="welfare"
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
          <p className="text-sm font-medium text-slate-900">
            No orders yet
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Create the first direct medication order to a registered pharmacy.
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
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

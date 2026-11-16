"use client";

import { useActionState } from "react";

import {
  acceptOrderAction,
  completeOrderAction,
  markOrderPreparedAction,
  rejectOrderAction,
} from "@/app/pharmacy/actions";
import { FormError } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { ToggleForm } from "@/components/admin/toggle-form";
import {
  ORDER_STATUS_LABELS,
  OrderStatusBadge,
} from "@/components/orders/order-status-badge";
import { isUserRole, ROLE_LABELS } from "@/lib/auth/roles";
import {
  formatAmount,
  formatDateTime,
  formatQuantity,
} from "@/lib/format";
import {
  INITIAL_PHARMACY_FORM_STATE,
  type PharmacyFormState,
} from "@/lib/pharmacy/form-state";
import type {
  OrderAuditLogRow,
  OrderItemRow,
} from "@/lib/types/database";
import type { PharmacyOrder } from "@/lib/pharmacy/data";

const PRICE_INPUT_CLASS =
  "w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

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
    return "Order submitted by the welfare home";
  }
  return `${ORDER_STATUS_LABELS[log.from_status]} → ${ORDER_STATUS_LABELS[log.to_status]}`;
}

function auditActor(log: OrderAuditLogRow): string | null {
  const role = metadataString(log, "actor_role");
  if (!role) return null;
  return isUserRole(role) ? ROLE_LABELS[role] : role;
}

function ItemsTable({
  items,
  editable = false,
  fieldErrors,
}: {
  items: OrderItemRow[];
  editable?: boolean;
  fieldErrors?: Record<string, string>;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        No medication lines were recorded for this order.
      </p>
    );
  }

  return (
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
          {items.map((item) => {
            const field = `price_${item.id}`;
            const error = fieldErrors?.[field];

            return (
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
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-700">
                  {formatQuantity(item.quantity, item.unit)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-right tabular-nums text-slate-700">
                  {editable ? (
                    <div>
                      <input
                        name={field}
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={item.unit_price}
                        aria-label={`Unit price for ${item.medication_name}`}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${field}-error` : undefined}
                        className={PRICE_INPUT_CLASS}
                      />
                      {error ? (
                        <p
                          id={`${field}-error`}
                          className="mt-1 max-w-40 text-right text-[0.65rem] text-rose-700"
                        >
                          {error}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    formatAmount(item.unit_price)
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-right font-medium tabular-nums text-slate-900">
                  {formatAmount(item.line_total)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50/60">
          <tr>
            <td
              colSpan={3}
              className="px-3 py-2 text-right text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500"
            >
              Order total
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
              {formatAmount(
                items.reduce((sum, item) => sum + Number(item.line_total), 0),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function AcceptOrderForm({ order }: { order: PharmacyOrder }) {
  const [state, formAction] = useActionState<PharmacyFormState, FormData>(
    acceptOrderAction,
    INITIAL_PHARMACY_FORM_STATE,
  );

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="order_id" value={order.id} />

      <ItemsTable
        items={order.items}
        editable
        fieldErrors={state.fieldErrors}
      />

      <FormError
        message={state.status === "error" ? state.message : undefined}
      />

      {order.items.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[0.7rem] leading-5 text-slate-500">
            Set the unit price on every line, then accept. Prices and lines
            freeze once the order leaves pending.
          </p>
          <SubmitButton
            label="Accept and save prices"
            pendingLabel="Accepting…"
          />
        </div>
      ) : (
        <p className="mt-3 text-xs text-rose-700">
          This order has no medication lines, so it cannot be accepted. Ask the
          welfare home to resubmit it.
        </p>
      )}
    </form>
  );
}

function RejectOrderForm({ order }: { order: PharmacyOrder }) {
  const [state, formAction] = useActionState<PharmacyFormState, FormData>(
    rejectOrderAction,
    INITIAL_PHARMACY_FORM_STATE,
  );
  const fieldId = `reject-reason-${order.id}`;

  return (
    <details className="mt-3 rounded-xl border border-rose-200 bg-rose-50/40">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-rose-800">
        Reject this order
      </summary>

      <form
        action={formAction}
        className="space-y-2 border-t border-rose-200 px-3 py-3"
      >
        <input type="hidden" name="order_id" value={order.id} />

        <label
          htmlFor={fieldId}
          className="block text-xs font-medium text-rose-900"
        >
          Rejection reason
        </label>
        <textarea
          id={fieldId}
          name="rejection_reason"
          rows={2}
          required
          maxLength={1000}
          placeholder="e.g. Item is out of stock with the supplier."
          aria-invalid={
            state.fieldErrors?.rejection_reason ? true : undefined
          }
          aria-describedby={
            state.fieldErrors?.rejection_reason ? `${fieldId}-error` : undefined
          }
          className="w-full rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
        />
        {state.fieldErrors?.rejection_reason ? (
          <p id={`${fieldId}-error`} className="text-xs text-rose-700">
            {state.fieldErrors.rejection_reason}
          </p>
        ) : null}

        <FormError
          message={state.status === "error" ? state.message : undefined}
        />

        <div className="flex justify-end">
          <SubmitButton
            label="Reject order"
            pendingLabel="Rejecting…"
            variant="light"
            className="border-rose-300 text-rose-700 hover:bg-rose-100"
          />
        </div>
      </form>
    </details>
  );
}

export function PharmacyOrderCard({ order }: { order: PharmacyOrder }) {
  const rejectionReason =
    order.rejection_reason ??
    order.audit_logs
      .map((log) => metadataString(log, "rejection_reason"))
      .find((value): value is string => Boolean(value)) ??
    null;
  const home = order.welfare_home;

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
            Submitted {formatDateTime(order.submitted_at)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-500">Current total</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {formatAmount(order.total_amount)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
            Requesting welfare home
          </p>
          <p className="mt-0.5 font-medium text-slate-800">
            {home?.name ?? "Welfare home unavailable"}
          </p>
          {home ? (
            <>
              <p className="mt-0.5 text-slate-500">
                Registration {home.registration_number}
              </p>
              <p className="mt-0.5 text-slate-500">
                {[home.address, home.location]
                  .filter(Boolean)
                  .join(", ") || "No address recorded"}
              </p>
              <p className="mt-0.5 text-slate-500">
                {[home.phone, home.email].filter(Boolean).join(" · ") ||
                  "No contact recorded"}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-slate-500">
              This order&apos;s welfare home is no longer visible.
            </p>
          )}
        </div>

        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
            Non-identifying bag label
          </p>
          <p className="mt-0.5 font-medium text-slate-800">
            {order.resident_reference ?? "—"}
          </p>
          <p className="mt-0.5 text-slate-500">
            The welfare home keeps all resident details on its side.
          </p>
          {order.notes ? (
            <p className="mt-2 rounded-lg bg-white px-2 py-1.5 leading-5 text-slate-600 ring-1 ring-inset ring-slate-200">
              <span className="font-medium text-slate-700">Order notes:</span>{" "}
              {order.notes}
            </p>
          ) : null}
        </div>
      </div>

      {order.status === "rejected" && rejectionReason ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="font-semibold">Rejection reason:</span>{" "}
          {rejectionReason}
        </p>
      ) : null}

      {order.status === "cancelled" ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Withdrawn by the welfare home before the pharmacy acted.
        </p>
      ) : null}

      {order.status === "pending" ? (
        <AcceptOrderForm order={order} />
      ) : (
        <ItemsTable items={order.items} />
      )}

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
                <li
                  key={log.id}
                  className="relative text-xs text-slate-600"
                >
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

      {order.status === "pending" ? <RejectOrderForm order={order} /> : null}

      {order.status === "accepted" ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <ToggleForm
            action={markOrderPreparedAction}
            fields={{ order_id: order.id }}
            label="Mark prepared"
            pendingLabel="Saving…"
            tone="success"
            confirmMessage="Mark this order as packed and ready for dispatch or pickup?"
            srDescription={`Mark order ${order.order_number} prepared`}
          />
        </div>
      ) : null}

      {order.status === "prepared" ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <ToggleForm
            action={completeOrderAction}
            fields={{ order_id: order.id }}
            label="Mark completed"
            pendingLabel="Saving…"
            tone="success"
            confirmMessage="Confirm the medication has been handed over or delivered?"
            srDescription={`Mark order ${order.order_number} completed`}
          />
        </div>
      ) : null}
    </article>
  );
}

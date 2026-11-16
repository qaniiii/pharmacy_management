import type { OrderStatus } from "@/lib/types/database";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-sky-50 text-sky-700 ring-sky-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  prepared: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_DOTS: Record<OrderStatus, string> = {
  pending: "bg-amber-500",
  accepted: "bg-sky-500",
  rejected: "bg-rose-500",
  prepared: "bg-indigo-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  prepared: "Prepared",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`}
      />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

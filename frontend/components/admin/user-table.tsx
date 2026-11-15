import { setUserActiveAction } from "@/app/admin/actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { ToggleForm } from "@/components/admin/toggle-form";
import type { AdminUserRow } from "@/lib/admin/data";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";

const ROLE_BADGE: Record<UserRole, string> = {
  system_admin: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  welfare_admin: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pharmacy_admin: "bg-sky-50 text-sky-700 ring-sky-200",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function tenantName(row: AdminUserRow): string {
  if (row.role === "system_admin") return "Platform-wide";
  if (row.role === "welfare_admin") {
    return row.welfare_home?.name ?? "Unknown welfare home";
  }
  return row.pharmacy?.name ?? "Unknown pharmacy";
}

export function UserTable({
  rows,
  currentUserId,
}: {
  rows: AdminUserRow[];
  currentUserId: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Administrators</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} accounts ·{" "}
            {rows.filter((row) => row.is_active).length} active
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/80 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">
                Administrator
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">
                Role
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">
                Tenant
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">
                Added
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2.5">
                Status
              </th>
              <th
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 text-right"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No administrator accounts yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-slate-900">
                      {row.full_name}
                      {row.id === currentUserId ? (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-slate-500">
                          you
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 break-all text-xs text-slate-500">
                      {row.email}
                    </p>
                    {row.phone ? (
                      <p className="text-xs text-slate-400">{row.phone}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE[row.role]}`}
                    >
                      {ROLE_LABELS[row.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-slate-600">
                    {tenantName(row)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-500">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge active={row.is_active} />
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {row.id === currentUserId ? (
                      <span className="text-xs text-slate-400">
                        Current account
                      </span>
                    ) : (
                      <ToggleForm
                        action={setUserActiveAction}
                        fields={{
                          user_id: row.id,
                          is_active: String(!row.is_active),
                        }}
                        label={row.is_active ? "Deactivate" : "Activate"}
                        pendingLabel="Saving…"
                        tone={row.is_active ? "danger" : "success"}
                        confirmMessage={
                          row.is_active
                            ? `Deactivate ${row.full_name}? They will be signed out and banned from signing in again.`
                            : undefined
                        }
                        srDescription={`${row.is_active ? "Deactivate" : "Activate"} ${row.full_name}`}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

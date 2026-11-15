import {
  setPharmacyActiveAction,
  setWelfareHomeActiveAction,
} from "@/app/admin/actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { ToggleForm } from "@/components/admin/toggle-form";
import type { PharmacyRow, WelfareHomeRow } from "@/lib/types/database";

const TABLE_CLASS = "min-w-full divide-y divide-slate-200 text-sm";
const HEAD_CLASS =
  "bg-slate-50/80 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500";
const HEAD_CELL_CLASS = "whitespace-nowrap px-4 py-2.5";
const CELL_CLASS = "px-4 py-3 align-top";

function location(parts: Array<string | null>): string {
  const value = parts.filter((part): part is string => Boolean(part)).join(", ");
  return value.length > 0 ? value : "—";
}

function Contact({
  phone,
  email,
}: {
  phone: string | null;
  email: string | null;
}) {
  if (!phone && !email) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="space-y-0.5 text-xs text-slate-600">
      {phone ? <p>{phone}</p> : null}
      {email ? (
        <p className="break-all text-slate-500">{email}</p>
      ) : null}
    </div>
  );
}

export function WelfareHomeTable({ rows }: { rows: WelfareHomeRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Welfare homes</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} registered ·{" "}
            {rows.filter((row) => row.is_active).length} active
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead className={HEAD_CLASS}>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Home
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Registration
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Contact
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Status
              </th>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No welfare homes yet. Register the first one to get started.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className={CELL_CLASS}>
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {location([row.city, row.region, row.postal_code])}
                    </p>
                  </td>
                  <td className={`${CELL_CLASS} whitespace-nowrap font-mono text-xs text-slate-600`}>
                    {row.registration_number}
                  </td>
                  <td className={CELL_CLASS}>
                    <Contact phone={row.phone} email={row.email} />
                  </td>
                  <td className={CELL_CLASS}>
                    <StatusBadge active={row.is_active} />
                  </td>
                  <td className={`${CELL_CLASS} text-right`}>
                    <ToggleForm
                      action={setWelfareHomeActiveAction}
                      fields={{
                        id: row.id,
                        is_active: String(!row.is_active),
                      }}
                      label={row.is_active ? "Deactivate" : "Activate"}
                      pendingLabel="Saving…"
                      tone={row.is_active ? "danger" : "success"}
                      confirmMessage={
                        row.is_active
                          ? `Deactivate ${row.name}? Its administrators will lose access to the workspace.`
                          : undefined
                      }
                      srDescription={`${row.is_active ? "Deactivate" : "Activate"} ${row.name}`}
                    />
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

export function PharmacyTable({ rows }: { rows: PharmacyRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Pharmacies</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} registered ·{" "}
            {rows.filter((row) => row.is_active).length} active
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead className={HEAD_CLASS}>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Pharmacy
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Licence
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Location
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Status
              </th>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No pharmacies yet. Register the first supplier to get started.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className={CELL_CLASS}>
                    <p className="font-medium text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.contact_person ?? "No contact person"}
                    </p>
                  </td>
                  <td className={`${CELL_CLASS} whitespace-nowrap font-mono text-xs text-slate-600`}>
                    {row.license_number}
                  </td>
                  <td className={CELL_CLASS}>
                    <p className="text-xs text-slate-600">
                      {location([row.city, row.region, row.postal_code])}
                    </p>
                    <Contact phone={row.phone} email={row.email} />
                  </td>
                  <td className={CELL_CLASS}>
                    <StatusBadge active={row.is_active} />
                  </td>
                  <td className={`${CELL_CLASS} text-right`}>
                    <ToggleForm
                      action={setPharmacyActiveAction}
                      fields={{
                        id: row.id,
                        is_active: String(!row.is_active),
                      }}
                      label={row.is_active ? "Deactivate" : "Activate"}
                      pendingLabel="Saving…"
                      tone={row.is_active ? "danger" : "success"}
                      confirmMessage={
                        row.is_active
                          ? `Deactivate ${row.name}? Welfare homes will no longer be able to order from it.`
                          : undefined
                      }
                      srDescription={`${row.is_active ? "Deactivate" : "Activate"} ${row.name}`}
                    />
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

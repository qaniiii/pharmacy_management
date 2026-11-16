import { setResidentActiveAction } from "@/app/welfare/actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { ToggleForm } from "@/components/admin/toggle-form";
import { ResidentEditor } from "@/components/welfare/resident-editor";
import type { ResidentRow } from "@/lib/types/database";
import { formatDate } from "@/lib/format";

const TABLE_CLASS = "min-w-full divide-y divide-slate-200 text-sm";
const HEAD_CLASS =
  "bg-slate-50/80 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500";
const HEAD_CELL_CLASS = "whitespace-nowrap px-4 py-2.5";
const CELL_CLASS = "px-4 py-3 align-top";

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <p className="text-xs text-slate-500">
      <span className="font-medium text-slate-600">{label}:</span>{" "}
      {value ?? "—"}
    </p>
  );
}

export function ResidentTable({ rows }: { rows: ResidentRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Resident register</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {rows.length} residents ·{" "}
            {rows.filter((row) => row.is_active).length} active
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Records are deactivated, never deleted, so order history stays intact.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className={TABLE_CLASS}>
          <thead className={HEAD_CLASS}>
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Resident
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Room / MRN
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Date of birth / gender
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Allergies
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Care notes
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Status
              </th>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No residents yet. Add the first resident to start tracking
                  stock and medication orders.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className={CELL_CLASS}>
                    <p className="font-medium text-slate-900">
                      {row.full_name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.is_active ? "Active" : "Inactive"}
                    </p>
                  </td>
                  <td className={CELL_CLASS}>
                    <Detail label="Room" value={row.room_number} />
                    <Detail
                      label="MRN"
                      value={row.medical_record_number}
                    />
                  </td>
                  <td className={CELL_CLASS}>
                    <p className="text-xs text-slate-600">
                      {formatDate(row.date_of_birth)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.gender ?? "Not specified"}
                    </p>
                  </td>
                  <td className={CELL_CLASS}>
                    {row.allergies.length > 0 ? (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {row.allergies.map((allergy) => (
                          <span
                            key={allergy}
                            className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.7rem] font-medium text-rose-700 ring-1 ring-inset ring-rose-200"
                          >
                            {allergy}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">None recorded</span>
                    )}
                  </td>
                  <td className={CELL_CLASS}>
                    <p className="line-clamp-3 max-w-64 whitespace-pre-line text-xs leading-5 text-slate-600">
                      {row.care_notes ?? "—"}
                    </p>
                  </td>
                  <td className={CELL_CLASS}>
                    <StatusBadge active={row.is_active} />
                  </td>
                  <td className={`${CELL_CLASS} text-right`}>
                    <div className="flex flex-col items-end gap-2">
                      <ResidentEditor
                        mode="edit"
                        resident={row}
                        triggerLabel="Edit"
                      />
                      <ToggleForm
                        action={setResidentActiveAction}
                        fields={{
                          resident_id: row.id,
                          is_active: String(!row.is_active),
                        }}
                        label={row.is_active ? "Deactivate" : "Reactivate"}
                        pendingLabel="Saving…"
                        tone={row.is_active ? "danger" : "success"}
                        confirmMessage={
                          row.is_active
                            ? `Deactivate ${row.full_name}? Their record and order history stay intact.`
                            : undefined
                        }
                        srDescription={`${row.is_active ? "Deactivate" : "Reactivate"} ${row.full_name}`}
                      />
                    </div>
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

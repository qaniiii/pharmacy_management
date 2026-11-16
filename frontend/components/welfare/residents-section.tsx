import { ResidentEditor } from "@/components/welfare/resident-editor";
import { ResidentTable } from "@/components/welfare/resident-table";
import type { ResidentRow } from "@/lib/types/database";

export function ResidentsSection({ residents }: { residents: ResidentRow[] }) {
  const active = residents.filter((resident) => resident.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Residents
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {residents.length} registered · {active} active ·{" "}
            {residents.length - active} inactive
          </p>
        </div>
        <ResidentEditor
          mode="create"
          triggerLabel="Add resident"
          variant="dark"
        />
      </div>

      <ResidentTable rows={residents} />
    </div>
  );
}

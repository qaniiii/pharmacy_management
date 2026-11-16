import { InventoryEditor } from "@/components/welfare/inventory-editor";
import { InventoryTable } from "@/components/welfare/inventory-table";
import type { ResidentRow } from "@/lib/types/database";
import type { InventoryWithResident } from "@/lib/welfare/data";
import {
  expiryState,
  isLowStock,
} from "@/lib/welfare/inventory";

export function InventorySection({
  inventory,
  residents,
}: {
  inventory: InventoryWithResident[];
  residents: ResidentRow[];
}) {
  const pooled = inventory.filter((item) => item.resident_id === null).length;
  const residentSpecific = inventory.length - pooled;
  const lowStock = inventory.filter((item) => isLowStock(item)).length;
  const expiring = inventory.filter((item) => {
    const state = expiryState(item.expiry_date);
    return state === "soon" || state === "expired";
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Inventory</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {inventory.length} lines · {pooled} pooled · {residentSpecific}{" "}
            resident-specific · {lowStock} low stock · {expiring} expiring or
            expired
          </p>
        </div>
        <InventoryEditor
          mode="create"
          residents={residents}
          triggerLabel="Add stock item"
          variant="dark"
        />
      </div>

      <InventoryTable rows={inventory} residents={residents} />
    </div>
  );
}

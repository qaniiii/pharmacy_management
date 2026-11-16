import { CreateOrderDrawer } from "@/components/welfare/create-order-drawer";
import { OrderHistory } from "@/components/welfare/order-history";
import type {
  PharmacyRow,
  ResidentRow,
} from "@/lib/types/database";
import type {
  InventoryWithResident,
  WelfareOrder,
} from "@/lib/welfare/data";

export function OrdersSection({
  orders,
  pharmacies,
  residents,
  inventory,
}: {
  orders: WelfareOrder[];
  pharmacies: PharmacyRow[];
  residents: ResidentRow[];
  inventory: InventoryWithResident[];
}) {
  const activePharmacies = pharmacies.filter(
    (pharmacy) => pharmacy.is_active,
  );
  const activeResidents = residents.filter((resident) => resident.is_active);
  const activeInventory = inventory.filter((item) => item.is_active);
  const pending = orders.filter((order) => order.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Medication orders
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {orders.length} orders · {pending} pending ·{" "}
            {activePharmacies.length} active{" "}
            {activePharmacies.length === 1 ? "pharmacy" : "pharmacies"}
          </p>
        </div>
        <CreateOrderDrawer
          pharmacies={activePharmacies}
          residents={activeResidents}
          inventory={activeInventory}
        />
      </div>

      {activePharmacies.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No active pharmacy is available yet. A system administrator must
          register and activate a pharmacy before you can order.
        </p>
      ) : null}

      <OrderHistory orders={orders} />
    </div>
  );
}

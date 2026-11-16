import type { Metadata } from "next";

import { AppFooter, AppHeader } from "@/components/app-header";
import { InventorySection } from "@/components/welfare/inventory-section";
import { OrdersSection } from "@/components/welfare/orders-section";
import { ResidentsSection } from "@/components/welfare/residents-section";
import { WelfareTabNav } from "@/components/welfare/welfare-tab-nav";
import { requireRole } from "@/lib/auth/profile";
import { isUserRole, ROLE_AREAS } from "@/lib/auth/roles";
import { loadTenant } from "@/lib/auth/tenant";
import {
  listInventory,
  listOrders,
  listResidents,
  listVisiblePharmacies,
} from "@/lib/welfare/data";
import { isLowStock } from "@/lib/welfare/inventory";
import { parseWelfareTab, WELFARE_TABS } from "@/lib/welfare/tabs";

export const metadata: Metadata = {
  title: "Welfare home workspace",
};

interface WelfarePageProps {
  searchParams: Promise<{
    tab?: string;
    notice?: string;
    denied?: string;
  }>;
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default async function WelfareDashboardPage({
  searchParams,
}: WelfarePageProps) {
  const [{ tab, notice, denied }, { supabase, user, profile }] =
    await Promise.all([searchParams, requireRole("welfare_admin")]);

  const activeTab = parseWelfareTab(tab);

  const [tenant, residents, inventory, orders, pharmacies] = await Promise.all([
    loadTenant(supabase, profile),
    listResidents(supabase),
    listInventory(supabase),
    listOrders(supabase),
    listVisiblePharmacies(supabase),
  ]);

  const activeResidents = residents.filter(
    (resident) => resident.is_active,
  ).length;
  const lowStock = inventory.filter((item) => isLowStock(item)).length;
  const pendingOrders = orders.filter(
    (order) => order.status === "pending",
  ).length;
  const tabMeta = WELFARE_TABS.find((entry) => entry.id === activeTab);

  const deniedMessage =
    denied && isUserRole(denied)
      ? `${ROLE_AREAS[denied]} requires a different role, so you were returned to your own workspace.`
      : undefined;
  const noticeMessage = notice ?? deniedMessage;
  const noticeTone = deniedMessage && !notice ? "denied" : "success";

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        role={profile.role}
        fullName={profile.full_name}
        email={profile.email || user.email || ""}
        wide
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Welfare home administrator
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              {tenant?.name ?? "Welfare home workspace"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Manage residents, pooled and resident-specific stock, and direct
              medication orders. Every query is scoped to this welfare home by
              Row Level Security.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">
              {tenant
                ? `${tenant.referenceLabel} ${tenant.reference}`
                : "Tenant record unavailable"}
            </p>
            {tenant?.location ? <p>{tenant.location}</p> : null}
            <p>Signed in as {profile.email || user.email}</p>
            {tenant && tenant.isActive === false ? (
              <p className="mt-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                Welfare home inactive
              </p>
            ) : null}
          </div>
        </div>

        {noticeMessage ? (
          <p
            role="status"
            className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
              noticeTone === "denied"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {noticeMessage}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Residents"
            value={residents.length}
            detail={`${activeResidents} active · ${residents.length - activeResidents} inactive`}
          />
          <Stat
            label="Inventory lines"
            value={inventory.length}
            detail={`${inventory.filter((item) => item.resident_id === null).length} pooled · ${inventory.filter((item) => item.resident_id !== null).length} resident-specific`}
          />
          <Stat
            label="Orders"
            value={orders.length}
            detail={`${pendingOrders} pending · ${orders.filter((order) => order.status === "completed").length} completed`}
          />
        </div>

        {lowStock > 0 ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            {lowStock} stock {lowStock === 1 ? "line is" : "lines are"} at or
            below the reorder level. Open the Inventory tab to review them.
          </p>
        ) : null}

        <div className="mt-6">
          <WelfareTabNav
            current={activeTab}
            counts={{
              residents: residents.length,
              inventory: inventory.length,
              orders: orders.length,
            }}
          />
        </div>

        <div className="mt-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {tabMeta?.label}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {tabMeta?.description}
          </p>
        </div>

        <div className="mt-4">
          {activeTab === "residents" ? (
            <ResidentsSection residents={residents} />
          ) : null}

          {activeTab === "inventory" ? (
            <InventorySection
              inventory={inventory}
              residents={residents}
            />
          ) : null}

          {activeTab === "orders" ? (
            <OrdersSection
              orders={orders}
              pharmacies={pharmacies}
              residents={residents}
              inventory={inventory}
              organisationName={tenant?.name ?? "Welfare home"}
              organisationDetail={
                tenant
                  ? `${tenant.referenceLabel} ${tenant.reference}`
                  : undefined
              }
            />
          ) : null}
        </div>
      </main>

      <AppFooter profileId={profile.id} wide />
    </div>
  );
}

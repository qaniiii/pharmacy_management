import type { Metadata } from "next";

import { AppFooter, AppHeader } from "@/components/app-header";
import { CreatePharmacyForm } from "@/components/admin/create-pharmacy-form";
import { CreateWelfareHomeForm } from "@/components/admin/create-welfare-home-form";
import { ProvisionUserForm } from "@/components/admin/provision-user-form";
import { TabNav } from "@/components/admin/tab-nav";
import {
  PharmacyTable,
  WelfareHomeTable,
} from "@/components/admin/tenant-tables";
import { UserTable } from "@/components/admin/user-table";
import {
  listAdminUsers,
  listPharmacies,
  listWelfareHomes,
  toTenantOptions,
} from "@/lib/admin/data";
import { ADMIN_TABS, parseAdminTab } from "@/lib/admin/tabs";
import { requireRole } from "@/lib/auth/profile";

export const metadata: Metadata = {
  title: "Platform administration",
};

interface AdminPageProps {
  searchParams: Promise<{ tab?: string; notice?: string }>;
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

export default async function AdminDashboardPage({
  searchParams,
}: AdminPageProps) {
  const [{ tab, notice }, { supabase, user, profile }] = await Promise.all([
    searchParams,
    requireRole("system_admin"),
  ]);

  const activeTab = parseAdminTab(tab);

  const [homes, pharmacies, users] = await Promise.all([
    listWelfareHomes(supabase),
    listPharmacies(supabase),
    listAdminUsers(supabase),
  ]);

  const activeHomes = homes.filter((home) => home.is_active).length;
  const activePharmacies = pharmacies.filter(
    (pharmacy) => pharmacy.is_active,
  ).length;
  const activeUsers = users.filter((account) => account.is_active).length;
  const tabMeta = ADMIN_TABS.find((entry) => entry.id === activeTab);

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
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              System administrator
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              Platform administration
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Onboard welfare homes and pharmacies, then issue each tenant its
              administrator accounts. Row Level Security keeps every other role
              inside its own tenant.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Signed in as{" "}
            <span className="font-medium text-slate-700">
              {profile.email || user.email}
            </span>
          </p>
        </div>

        {notice ? (
          <p
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {notice}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Welfare homes"
            value={homes.length}
            detail={`${activeHomes} active · ${homes.length - activeHomes} inactive`}
          />
          <Stat
            label="Pharmacies"
            value={pharmacies.length}
            detail={`${activePharmacies} active · ${pharmacies.length - activePharmacies} inactive`}
          />
          <Stat
            label="Administrators"
            value={users.length}
            detail={`${activeUsers} active · ${users.length - activeUsers} deactivated`}
          />
        </div>

        <div className="mt-6">
          <TabNav
            current={activeTab}
            counts={{
              welfare: homes.length,
              pharmacies: pharmacies.length,
              users: users.length,
            }}
          />
        </div>

        <div className="mt-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {tabMeta?.label}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{tabMeta?.description}</p>
        </div>

        <div className="mt-4">
          {activeTab === "welfare" ? (
            <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <CreateWelfareHomeForm />
              <WelfareHomeTable rows={homes} />
            </div>
          ) : null}

          {activeTab === "pharmacies" ? (
            <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <CreatePharmacyForm />
              <PharmacyTable rows={pharmacies} />
            </div>
          ) : null}

          {activeTab === "users" ? (
            <div className="space-y-5">
              <ProvisionUserForm
                homes={toTenantOptions(homes)}
                pharmacies={toTenantOptions(pharmacies)}
              />
              <UserTable rows={users} currentUserId={profile.id} />
            </div>
          ) : null}
        </div>
      </main>

      <AppFooter profileId={profile.id} wide />
    </div>
  );
}

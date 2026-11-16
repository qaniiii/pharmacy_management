import type { Metadata } from "next";

import { AppFooter, AppHeader } from "@/components/app-header";
import { PharmacyOrderQueue } from "@/components/pharmacy/order-queue";
import { requireRole } from "@/lib/auth/profile";
import { isUserRole, ROLE_AREAS } from "@/lib/auth/roles";
import {
  getPharmacyProfile,
  listPharmacyOrders,
} from "@/lib/pharmacy/data";

export const metadata: Metadata = {
  title: "Pharmacy workspace",
};

interface PharmacyPageProps {
  searchParams: Promise<{ notice?: string; denied?: string }>;
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

function joinParts(parts: Array<string | null>): string | null {
  const value = parts.filter((part): part is string => Boolean(part)).join(", ");
  return value.length > 0 ? value : null;
}

export default async function PharmacyDashboardPage({
  searchParams,
}: PharmacyPageProps) {
  const [{ notice, denied }, { supabase, user, profile }] = await Promise.all([
    searchParams,
    requireRole("pharmacy_admin"),
  ]);

  const pharmacyId = profile.pharmacy_id;
  const [pharmacy, orders] = await Promise.all([
    pharmacyId ? getPharmacyProfile(supabase, pharmacyId) : null,
    pharmacyId ? listPharmacyOrders(supabase) : [],
  ]);

  const pending = orders.filter((order) => order.status === "pending").length;
  const accepted = orders.filter((order) => order.status === "accepted").length;
  const prepared = orders.filter((order) => order.status === "prepared").length;
  const completed = orders.filter(
    (order) => order.status === "completed",
  ).length;
  const rejected = orders.filter((order) => order.status === "rejected").length;
  const cancelled = orders.filter(
    (order) => order.status === "cancelled",
  ).length;

  const deniedMessage =
    denied && isUserRole(denied)
      ? `${ROLE_AREAS[denied]} requires a different role, so you were returned to your own workspace.`
      : undefined;
  const noticeMessage = notice ?? deniedMessage;
  const noticeTone = deniedMessage && !notice ? "denied" : "success";

  const address = pharmacy
    ? joinParts([
        pharmacy.address_line1,
        pharmacy.address_line2,
      ])
    : null;
  const location = pharmacy
    ? joinParts([pharmacy.city, pharmacy.region, pharmacy.postal_code])
    : null;

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
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
              Pharmacy administrator
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              {pharmacy?.name ?? "Pharmacy workspace"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Review incoming orders, price the medication lines while they are
              pending, and move each order through acceptance, preparation and
              handover. Every order is scoped to this pharmacy by Row Level
              Security.
            </p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">
              {pharmacy
                ? `Licence no. ${pharmacy.license_number}`
                : "Tenant record unavailable"}
            </p>
            {address ? <p>{address}</p> : null}
            {location ? <p>{location}</p> : null}
            {pharmacy?.contact_person ? (
              <p>Contact: {pharmacy.contact_person}</p>
            ) : null}
            {pharmacy && (pharmacy.phone || pharmacy.email) ? (
              <p>
                {[pharmacy.phone, pharmacy.email].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p>Signed in as {profile.email || user.email}</p>
            {pharmacy ? (
              <p
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                  pharmacy.is_active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-rose-50 text-rose-700 ring-rose-200"
                }`}
              >
                {pharmacy.is_active ? "Active pharmacy" : "Pharmacy inactive"}
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

        {!pharmacyId ? (
          <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Your profile is not linked to a pharmacy. Ask a system
            administrator to attach this account to a pharmacy before
            fulfilling orders.
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Pending"
            value={pending}
            detail="Awaiting acceptance and pricing"
          />
          <Stat
            label="In fulfilment"
            value={accepted + prepared}
            detail={`${accepted} accepted · ${prepared} prepared`}
          />
          <Stat
            label="Completed"
            value={completed}
            detail="Handed over or delivered"
          />
          <Stat
            label="Closed without fulfilment"
            value={rejected + cancelled}
            detail={`${rejected} rejected · ${cancelled} withdrawn`}
          />
        </div>

        <div className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Order queue
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {orders.length} orders · {pending} pending · filter by status
                below. Only the non-identifying bag label is shared by the
                welfare home.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <PharmacyOrderQueue
              orders={orders}
              organisationName={pharmacy?.name ?? "Pharmacy"}
              organisationDetail={
                pharmacy ? `Licence no. ${pharmacy.license_number}` : undefined
              }
            />
          </div>
        </div>
      </main>

      <AppFooter profileId={profile.id} wide />
    </div>
  );
}

import { signOutAction } from "@/lib/auth/actions";
import { ROLE_AREAS, ROLE_LABELS } from "@/lib/auth/roles";
import type { TenantSummary } from "@/lib/auth/tenant";
import type { UserRole } from "@/lib/types/database";

const ROLE_BADGE: Record<UserRole, string> = {
  system_admin: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  welfare_admin: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pharmacy_admin: "bg-sky-50 text-sky-700 ring-sky-200",
};

const UPCOMING: Record<UserRole, string[]> = {
  system_admin: [
    "Manage welfare homes, pharmacies and administrator accounts",
    "Break-glass visibility across tenants, with every action audited",
    "Platform health and order-volume reporting",
  ],
  welfare_admin: [
    "Resident records and prescription stock",
    "Building and submitting medication orders",
    "Withdrawing a pending order and confirming receipt",
  ],
  pharmacy_admin: [
    "The incoming order queue for this pharmacy",
    "Accepting, rejecting and preparing orders",
    "Order history that carries no resident identifiers",
  ],
};

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={
          mono
            ? "break-all text-right font-mono text-xs leading-5 text-slate-700"
            : "text-right text-slate-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function RoleDashboard({
  role,
  fullName,
  email,
  profileId,
  tenant,
  notice,
}: {
  role: UserRole;
  fullName: string;
  email: string;
  profileId: string;
  tenant: TenantSummary | null;
  notice?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white"
            >
              Rx
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-slate-900">
                Pharmacy &amp; Welfare Platform
              </p>
              <p className="text-xs text-slate-500">{ROLE_AREAS[role]}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{fullName}</p>
              <p className="text-xs text-slate-500">{email}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        {notice ? (
          <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </p>
        ) : null}

        <div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ROLE_BADGE[role]}`}
          >
            {ROLE_LABELS[role]}
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {ROLE_AREAS[role]}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Signed in as <span className="font-medium">{email}</span>
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Tenant</h2>

            {tenant ? (
              <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <p className="text-lg font-semibold leading-7 text-slate-900">
                    {tenant.name}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      tenant.isActive === false
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    }`}
                  >
                    {tenant.isActive === false ? "Inactive" : "Active"}
                  </span>
                </div>

                <dl className="mt-4 space-y-2.5 text-sm">
                  <Detail
                    label={tenant.referenceLabel}
                    value={tenant.reference}
                    mono={tenant.kind !== "platform"}
                  />
                  {tenant.address ? (
                    <Detail label="Address" value={tenant.address} />
                  ) : null}
                  {tenant.location ? (
                    <Detail label="Location" value={tenant.location} />
                  ) : null}
                  {tenant.phone ? (
                    <Detail label="Phone" value={tenant.phone} />
                  ) : null}
                  {tenant.email ? (
                    <Detail label="Email" value={tenant.email} />
                  ) : null}
                </dl>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
                The tenant record for this profile could not be loaded. Contact a
                system administrator.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Account</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Detail label="Name" value={fullName} />
              <Detail label="Email" value={email} />
              <Detail label="Role" value={role} mono />
              <Detail label="Profile ID" value={profileId} mono />
            </dl>
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
              Role and tenant binding are read from{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.7rem]">
                public.profiles
              </code>{" "}
              on the server and re-checked on every request.
            </p>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Phase 2 — foundation only
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Authentication, session refresh and role isolation are wired. This
            workspace deliberately renders no domain data yet, because the
            database tables now exist and must be read through their real
            interfaces rather than placeholder records.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {UPCOMING[role].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:px-6">
          <span>Pharmacy &amp; Welfare Platform</span>
          <span className="font-mono">{profileId}</span>
        </div>
      </footer>
    </div>
  );
}

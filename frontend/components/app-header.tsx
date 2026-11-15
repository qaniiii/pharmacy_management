import { signOutAction } from "@/lib/auth/actions";
import { ROLE_AREAS } from "@/lib/auth/roles";
import type { UserRole } from "@/lib/types/database";

/** Shared top bar for every authenticated workspace. */
export function AppHeader({
  role,
  fullName,
  email,
  wide = false,
}: {
  role: UserRole;
  fullName: string;
  email: string;
  wide?: boolean;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div
        className={`mx-auto flex w-full items-center justify-between gap-4 px-4 py-3.5 sm:px-6 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
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
  );
}

/** Shared footer; shows the profile id for support requests. */
export function AppFooter({
  profileId,
  wide = false,
}: {
  profileId: string;
  wide?: boolean;
}) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div
        className={`mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:px-6 ${
          wide ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <span>Pharmacy &amp; Welfare Platform</span>
        <span className="font-mono">{profileId}</span>
      </div>
    </footer>
  );
}

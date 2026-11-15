import type { Metadata } from "next";

import { InviteAcceptance } from "@/app/invite/invite-acceptance";

export const metadata: Metadata = {
  title: "Accept invitation",
};

/**
 * Public landing page for Supabase invitation emails. The proxy allows
 * `/invite` without a session; the client component consumes the token and
 * asks the new administrator to choose a password.
 */
export default function InvitePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white"
          >
            Rx
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-900">
              Pharmacy &amp; Welfare Platform
            </p>
            <p className="text-xs text-slate-500">
              Administrator invitation
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
          <InviteAcceptance />
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Invitation links expire. Ask your system administrator for a new one
          if this page reports that the link is invalid.
        </p>
      </div>
    </main>
  );
}

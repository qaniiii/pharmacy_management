import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const NOTICES: Record<string, string> = {
  account_unavailable:
    "This account has no active profile. Ask a system administrator to provision it.",
  lookup_failed:
    "We could not verify your profile just now. Please try signing in again.",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; reason?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, reason } = await searchParams;
  const notice = reason ? NOTICES[reason] : undefined;

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
              Medication ordering and stock management
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Sign in to your workspace
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            Administrators are provisioned by the platform team. There is no
            self sign-up.
          </p>

          <div className="mt-6">
            <LoginForm nextPath={next} notice={notice} />
          </div>

          <p className="mt-6 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">
            Accounts are issued per welfare home or pharmacy. If you need
            access, contact your system administrator.
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Sessions are verified on every request by Supabase Auth.
        </p>
      </div>
    </main>
  );
}

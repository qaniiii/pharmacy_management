"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "saving" | "done" | "error";

/**
 * Consumes the Supabase invitation link.
 *
 * Supabase appends the session to the redirect URL — `#access_token=…` for the
 * implicit flow or `?code=…` when PKCE is enabled. The browser client turns
 * either into cookie-backed session, after which the invited administrator
 * chooses their own password. Tokens are stripped from the address bar as soon
 * as they are consumed.
 */
export function InviteAcceptance() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const supabase = createClient();
      const fragment = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      const code = new URLSearchParams(window.location.search).get("code");

      let failure: string | null = null;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        failure = error?.message ?? null;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        failure = error?.message ?? null;
      }

      // Never leave tokens in the address bar or browser history.
      window.history.replaceState(null, "", window.location.pathname);

      if (cancelled) return;

      if (failure) {
        setStatus("error");
        setMessage(
          "This invitation link is no longer valid. Ask a system administrator to send a new one.",
        );
        return;
      }

      const { data } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!data.user) {
        setStatus("error");
        setMessage(
          "Open the link from your invitation email. If you already accepted it, sign in instead.",
        );
        return;
      }

      setEmail(data.user.email ?? null);
      setStatus("ready");
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Use at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setFormError("The two passwords do not match.");
      return;
    }

    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("ready");
      setFormError(error.message);
      return;
    }

    setStatus("done");
    // The browser client already wrote the refreshed session cookies; the root
    // page resolves the new administrator's workspace from their profile.
    router.replace("/");
  }

  if (status === "checking") {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Checking your invitation
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Verifying the link with Supabase Auth…
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Invitation unavailable
        </h1>
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
        >
          {message}
        </p>
        <a
          href="/login"
          className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Go to sign in
        </a>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Password set
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Taking you to your workspace…
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Set your password
      </h1>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">
        {email ? (
          <>
            Choose a password for{" "}
            <span className="font-medium text-slate-900">{email}</span>.
          </>
        ) : (
          "Choose a password for your new administrator account."
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="invite-password"
            className="block text-sm font-medium text-slate-700"
          >
            New password
          </label>
          <input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="invite-confirmation"
            className="block text-sm font-medium text-slate-700"
          >
            Confirm password
          </label>
          <input
            id="invite-confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800"
          >
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Set password and continue"}
        </button>
      </form>
    </div>
  );
}

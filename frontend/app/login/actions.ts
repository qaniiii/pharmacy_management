"use server";

import { redirect } from "next/navigation";

import type { LoginState } from "@/lib/auth/login";
import { resolvePostLoginPath } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Password sign-in. There is no sign-up path by design: accounts and their
 * `profiles` rows are provisioned by a system administrator (Supabase Admin API
 * or SQL), and self-registration is disabled in Supabase Auth.
 */
export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const requested = String(formData.get("next") ?? "");

  if (!email || !password) {
    return {
      status: "error",
      message: "Enter your work email and password.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    // Do not distinguish "unknown email" from "wrong password": that would
    // turn the form into an account-enumeration oracle.
    const message =
      error?.status === 400 || !error
        ? "Those credentials do not match an active account."
        : error.message;
    return { status: "error", message };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message:
        "Signed in, but your profile could not be loaded. Try again or contact an administrator.",
    };
  }

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message:
        "This account has no active profile. Ask a system administrator to provision it.",
    };
  }

  redirect(resolvePostLoginPath(profile.role, requested));
}

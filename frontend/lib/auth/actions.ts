"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Clears the session and returns to the login screen.
 *
 * `scope: "local"` only removes the cookies for this browser; the auth server
 * is not contacted, so sign-out always succeeds even if Supabase is
 * unreachable. The refresh token stays valid until it expires — acceptable for
 * a shared-workstation product where the browser session is the boundary.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { Database, ProfileRow, UserRole } from "@/lib/types/database";

export interface AuthenticatedSession {
  supabase: SupabaseClient<Database>;
  user: User;
  profile: ProfileRow;
}

export interface PartialSession {
  supabase: SupabaseClient<Database>;
  user: User;
  profile: ProfileRow | null;
}

/**
 * Reads the caller's profile.
 *
 * The role and tenancy are read from `public.profiles`, never from the JWT or
 * from user-editable metadata: those are claims the user can influence.
 * `profiles_select_own` in the RLS policy makes this readable to the user.
 */
export async function getProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  return data;
}

/** Resolves the session without redirecting, for routing decision points. */
export async function getSessionProfile(): Promise<PartialSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return { supabase, user, profile: await getProfile(supabase, user.id) };
}

/**
 * Server-component guard used by every role area.
 *
 * Defence in depth: the proxy already enforces this, but a page rendered
 * outside the proxy matcher must still refuse to render another role's data.
 */
export async function requireRole(
  requiredRole: UserRole,
): Promise<AuthenticatedSession> {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (!session.profile || !session.profile.is_active) {
    redirect("/login?reason=account_unavailable");
  }

  if (session.profile.role !== requiredRole) {
    redirect(ROLE_HOME[session.profile.role]);
  }

  return {
    supabase: session.supabase,
    user: session.user,
    profile: session.profile,
  };
}

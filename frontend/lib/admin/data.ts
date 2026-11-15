/**
 * Read-side queries for the admin portal.
 *
 * These run through the cookie-bound Supabase client as the signed-in system
 * administrator, so Row Level Security — not application code — decides what is
 * visible. Mutations that need the service role go through FastAPI instead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  PharmacyRow,
  ProfileRow,
  WelfareHomeRow,
} from "@/lib/types/database";

/** A profile plus the human-readable name of its tenant. */
export interface AdminUserRow extends ProfileRow {
  welfare_home: { name: string } | null;
  pharmacy: { name: string } | null;
}

export async function listWelfareHomes(
  supabase: SupabaseClient<Database>,
): Promise<WelfareHomeRow[]> {
  const { data, error } = await supabase
    .from("welfare_homes")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load welfare homes: ${error.message}`);
  }

  return data ?? [];
}

export async function listPharmacies(
  supabase: SupabaseClient<Database>,
): Promise<PharmacyRow[]> {
  const { data, error } = await supabase
    .from("pharmacies")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Could not load pharmacies: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Lists every profile with its tenant name.
 *
 * The embedded selects rely on the `profiles_welfare_home_id_fkey` and
 * `profiles_pharmacy_id_fkey` relations declared in `lib/types/database.ts`.
 * `.returns<>()` keeps the row shape explicit even if a future PostgREST
 * version changes how aliases are inferred.
 */
export async function listAdminUsers(
  supabase: SupabaseClient<Database>,
): Promise<AdminUserRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, welfare_home:welfare_homes(name), pharmacy:pharmacies(name)")
    .order("created_at", { ascending: false })
    .returns<AdminUserRow[]>();

  if (error) {
    throw new Error(`Could not load administrator accounts: ${error.message}`);
  }

  return data ?? [];
}

export interface TenantOption {
  id: string;
  name: string;
  is_active: boolean;
}

export function toTenantOptions(
  rows: Array<WelfareHomeRow | PharmacyRow>,
): TenantOption[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    is_active: row.is_active,
  }));
}

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ProfileRow } from "@/lib/types/database";

export interface TenantSummary {
  kind: "welfare_home" | "pharmacy" | "platform";
  name: string;
  referenceLabel: string;
  reference: string;
  address: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean | null;
}

function joinParts(parts: Array<string | null>): string | null {
  const value = parts.filter((part): part is string => Boolean(part)).join(", ");
  return value.length > 0 ? value : null;
}

/**
 * Loads the tenant the caller belongs to.
 *
 * RLS scopes the lookup: a welfare admin can only read its own home, a
 * pharmacy admin only its own pharmacy. Returns `null` when the profile has
 * no tenant binding (system admin) or when the tenant row is unavailable.
 */
export async function loadTenant(
  supabase: SupabaseClient<Database>,
  profile: ProfileRow,
): Promise<TenantSummary | null> {
  if (profile.role === "system_admin") {
    return {
      kind: "platform",
      name: "Platform-wide access",
      referenceLabel: "Scope",
      reference: "All welfare homes and pharmacies",
      address: null,
      location: null,
      phone: null,
      email: null,
      isActive: profile.is_active,
    };
  }

  if (profile.role === "welfare_admin") {
    if (!profile.welfare_home_id) return null;

    const { data, error } = await supabase
      .from("welfare_homes")
      .select(
        "name, registration_number, address_line1, address_line2, city, region, postal_code, phone, email, is_active",
      )
      .eq("id", profile.welfare_home_id)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load welfare home: ${error.message}`);
    }
    if (!data) return null;

    return {
      kind: "welfare_home",
      name: data.name,
      referenceLabel: "Registration no.",
      reference: data.registration_number,
      address: joinParts([data.address_line1, data.address_line2]),
      location: joinParts([data.city, data.region, data.postal_code]),
      phone: data.phone,
      email: data.email,
      isActive: data.is_active,
    };
  }

  if (!profile.pharmacy_id) return null;

  const { data, error } = await supabase
    .from("pharmacies")
    .select(
      "name, license_number, contact_person, address_line1, address_line2, city, region, postal_code, phone, email, is_active",
    )
    .eq("id", profile.pharmacy_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load pharmacy: ${error.message}`);
  }
  if (!data) return null;

  return {
    kind: "pharmacy",
    name: data.name,
    referenceLabel: "Licence no.",
    reference: data.license_number,
    address: joinParts([data.address_line1, data.address_line2]),
    location: joinParts([data.city, data.region, data.postal_code]),
    phone: data.phone,
    email: data.email,
    isActive: data.is_active,
  };
}

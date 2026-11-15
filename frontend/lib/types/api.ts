/**
 * Payloads exchanged with the FastAPI administration endpoints.
 *
 * Only provisioning and activation require the service-role key, so only those
 * two operations cross into the backend. Everything the admin portal displays
 * is read directly from Supabase under the caller's RLS policies.
 */

import type { ProfileRow, UserRole } from "@/lib/types/database";

/** Roles the platform owner may create; `system_admin` is SQL-only. */
export type ProvisionableRole = Exclude<UserRole, "system_admin">;

export type ProvisionMode = "password" | "invite";

export interface ProvisionUserPayload {
  email: string;
  full_name: string;
  phone: string | null;
  role: ProvisionableRole;
  welfare_home_id: string | null;
  pharmacy_id: string | null;
  /** Omit entirely to send an invitation email instead. */
  password?: string;
}

export interface ProvisionedUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  welfare_home_id: string | null;
  pharmacy_id: string | null;
  is_active: boolean;
  mode: ProvisionMode;
}

export interface UserStatusPayload {
  is_active: boolean;
}

export type UserStatusResponse = ProfileRow;

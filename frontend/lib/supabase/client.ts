"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "@/lib/types/database";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Browser-side Supabase client. Requests are always made as the signed-in
 * user, so Row Level Security decides what is visible.
 */
export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabasePublicConfig();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}

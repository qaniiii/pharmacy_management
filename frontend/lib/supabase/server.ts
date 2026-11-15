import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Server-side Supabase client bound to the request cookies.
 *
 * Always queried as the signed-in user, never with the service-role key, so a
 * mistake in application code still cannot cross a tenant boundary.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the
          // session on every request, so this is expected and safe to ignore.
        }
      },
    },
  });
}

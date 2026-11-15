/**
 * The only environment values the frontend is allowed to read.
 *
 * Both live in the repository-root `.env.local` (see `.env.example`). Values
 * are validated lazily so that a missing key produces a clear runtime error
 * instead of a cryptic `fetch` failure.
 */
export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

let cached: SupabasePublicConfig | null = null;

export function getSupabasePublicConfig(): SupabasePublicConfig {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in the repository-root .env.local " +
        "(copy .env.example if it does not exist yet).",
    );
  }

  cached = { url: url.replace(/\/+$/, ""), anonKey };
  return cached;
}

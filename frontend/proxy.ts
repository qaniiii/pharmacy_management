import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ROLE_HOME, roleFromPathname } from "@/lib/auth/roles";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database, UserRole } from "@/lib/types/database";

const LOGIN_PATH = "/login";
const INVITE_PATH = "/invite";

/** Paths an unauthenticated visitor may load. */
const PUBLIC_PATHS = new Set([LOGIN_PATH, INVITE_PATH]);

/** `pathname` without a trailing slash, except for the root. */
function normalisePath(pathname: string): string {
  if (pathname.length <= 1) return pathname || "/";
  return pathname.replace(/\/+$/, "");
}

/**
 * Next.js 16 proxy (the replacement for `middleware.ts`).
 *
 * Responsibilities:
 *   1. Refresh the Supabase session cookies on every request.
 *   2. Allow `/login` and `/invite` for unauthenticated callers, and reject
 *      every other area.
 *   3. Reject sessions that have no active `profiles` row (unprovisioned or
 *      deactivated accounts) — those cookies are cleared.
 *   4. Pin each role to its own area and bounce authenticated users who stray
 *      out of it back to their own dashboard.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicConfig();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Keep the request and response cookie jars in sync so that a refresh
        // performed below is visible to this request's handlers.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { pathname } = request.nextUrl;
  const path = normalisePath(pathname);

  const redirectTo = (target: string): NextResponse => {
    const [targetPath, targetQuery] = target.split("?");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = targetPath ?? "/";
    redirectUrl.search = targetQuery ? `?${targetQuery}` : "";

    const redirectResponse = NextResponse.redirect(redirectUrl);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (PUBLIC_PATHS.has(path)) return response;
    return redirectTo(
      `${LOGIN_PATH}?next=${encodeURIComponent(pathname + request.nextUrl.search)}`,
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("proxy: profile lookup failed", error.message);
    return redirectTo(`${LOGIN_PATH}?reason=lookup_failed`);
  }

  // Authenticated but not a provisioned, active administrator. Do not leave a
  // usable session behind for an account that has no application identity.
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo(`${LOGIN_PATH}?reason=account_unavailable`);
  }

  if (path === LOGIN_PATH) {
    return redirectTo(ROLE_HOME[profile.role]);
  }

  const requiredRole: UserRole | null = roleFromPathname(pathname);

  // Unknown paths keep falling through to Next's 404 handling; only the three
  // role areas and `/` are routing decisions.
  if (!requiredRole) return response;

  if (requiredRole !== profile.role) {
    return redirectTo(
      `${ROLE_HOME[profile.role]}?denied=${encodeURIComponent(requiredRole)}`,
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. The session cookie is refreshed on every
     * matched request, which is what keeps the server components in sync.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};

import type { UserRole } from "@/lib/types/database";

/** Single source of truth for role -> landing area. */
export const ROLE_HOME: Record<UserRole, string> = {
  system_admin: "/admin",
  welfare_admin: "/welfare",
  pharmacy_admin: "/pharmacy",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  system_admin: "System administrator",
  welfare_admin: "Welfare home administrator",
  pharmacy_admin: "Pharmacy administrator",
};

export const ROLE_AREAS: Record<UserRole, string> = {
  system_admin: "System administration",
  welfare_admin: "Welfare home workspace",
  pharmacy_admin: "Pharmacy workspace",
};

const ROLE_BY_SEGMENT: Record<string, UserRole> = {
  admin: "system_admin",
  welfare: "welfare_admin",
  pharmacy: "pharmacy_admin",
};

/** Maps a URL prefix (`/welfare/orders`) to the role allowed to see it. */
export function roleFromPathname(pathname: string): UserRole | null {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  return ROLE_BY_SEGMENT[segment] ?? null;
}

export function isUserRole(value: unknown): value is UserRole {
  return (
    value === "system_admin" ||
    value === "welfare_admin" ||
    value === "pharmacy_admin"
  );
}

/**
 * Guards the post-login `?next=` target: only same-area, absolute paths are
 * honoured so the parameter cannot be used as an open redirect or to bounce a
 * user into another tenant's area.
 */
export function resolvePostLoginPath(
  role: UserRole,
  requested: string | null | undefined,
): string {
  const home = ROLE_HOME[role];
  if (!requested) return home;
  if (!requested.startsWith("/") || requested.startsWith("//")) return home;
  if (requested !== home && !requested.startsWith(`${home}/`)) return home;
  return requested;
}

import type { Metadata } from "next";

import { RoleDashboard } from "@/components/role-dashboard";
import { requireRole } from "@/lib/auth/profile";
import { isUserRole, ROLE_AREAS } from "@/lib/auth/roles";
import { loadTenant } from "@/lib/auth/tenant";

export const metadata: Metadata = {
  title: "System administration",
};

interface AdminPageProps {
  searchParams: Promise<{ denied?: string }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminPageProps) {
  const [{ denied }, { supabase, user, profile }] = await Promise.all([
    searchParams,
    requireRole("system_admin"),
  ]);

  const tenant = await loadTenant(supabase, profile);
  const notice =
    denied && isUserRole(denied)
      ? `${ROLE_AREAS[denied]} requires a different role, so you were returned to your own workspace.`
      : undefined;

  return (
    <RoleDashboard
      role={profile.role}
      fullName={profile.full_name}
      email={profile.email || user.email || ""}
      profileId={profile.id}
      tenant={tenant}
      notice={notice}
    />
  );
}

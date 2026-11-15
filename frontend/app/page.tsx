import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth/profile";
import { ROLE_HOME } from "@/lib/auth/roles";

/**
 * The proxy already handles unauthenticated visitors; this page resolves the
 * signed-in administrator's landing area.
 */
export default async function HomePage() {
  const session = await getSessionProfile();

  if (!session) redirect("/login");

  if (!session.profile || !session.profile.is_active) {
    redirect("/login?reason=account_unavailable");
  }

  redirect(ROLE_HOME[session.profile.role]);
}

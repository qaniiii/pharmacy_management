/** Tab routing for `/admin?tab=...`. */

export type AdminTab = "welfare" | "pharmacies" | "users";

export const ADMIN_TABS: ReadonlyArray<{
  id: AdminTab;
  label: string;
  description: string;
}> = [
  {
    id: "welfare",
    label: "Welfare homes",
    description: "Customer tenants and their registration details.",
  },
  {
    id: "pharmacies",
    label: "Pharmacies",
    description: "Supplier tenants that fulfil medication orders.",
  },
  {
    id: "users",
    label: "Administrators",
    description: "Tenant accounts and platform access.",
  },
];

export function parseAdminTab(value: string | undefined): AdminTab {
  return value === "pharmacies" || value === "users" ? value : "welfare";
}

export function adminTabHref(tab: AdminTab): string {
  return `/admin?tab=${tab}`;
}

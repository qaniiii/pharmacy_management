/** Tab routing for `/welfare?tab=...`. */

export type WelfareTab = "residents" | "inventory" | "orders";

export const WELFARE_TABS: ReadonlyArray<{
  id: WelfareTab;
  label: string;
  description: string;
}> = [
  {
    id: "residents",
    label: "Residents",
    description:
      "The resident register for this welfare home. Residents are deactivated, never deleted.",
  },
  {
    id: "inventory",
    label: "Inventory",
    description:
      "General pooled stock and medication allocated to individual residents.",
  },
  {
    id: "orders",
    label: "Orders",
    description:
      "Direct medication orders to a registered pharmacy, with the full status history.",
  },
];

export function parseWelfareTab(value: string | undefined): WelfareTab {
  return value === "inventory" || value === "orders" ? value : "residents";
}

export function welfareTabHref(tab: WelfareTab): string {
  return `/welfare?tab=${tab}`;
}

import Link from "next/link";

import {
  WELFARE_TABS,
  type WelfareTab,
  welfareTabHref,
} from "@/lib/welfare/tabs";

export function WelfareTabNav({
  current,
  counts,
}: {
  current: WelfareTab;
  counts: Record<WelfareTab, number>;
}) {
  return (
    <nav
      aria-label="Welfare home sections"
      className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
    >
      {WELFARE_TABS.map((tab) => {
        const active = tab.id === current;

        return (
          <Link
            key={tab.id}
            href={welfareTabHref(tab.id)}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums ${
                active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {counts[tab.id]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { useState, type ReactNode } from "react";

// Current/Next week used to render as two full panels stacked (then side
// by side) — both permanently on screen. Team Leader's explicit ask: one
// frame, tab-switched, only the selected week's table showing at a time.
// The two panels are still fetched server-side up front (as props here,
// already-rendered JSX) — switching tabs is instant, no refetch, just
// toggling which one is visible.
export default function WeekTabs({ current, next }: { current: ReactNode; next: ReactNode }) {
  const [tab, setTab] = useState<"current" | "next">("current");

  const tabBase =
    "px-4 py-2 text-[13px] font-bold rounded-t-lg border border-b-0 transition-colors -mb-px";
  const activeTab = "bg-[var(--paper-raised)] border-[var(--line)] text-[var(--accent-strong)]";
  const inactiveTab =
    "bg-transparent border-transparent text-[var(--muted)] hover:text-[var(--ink)]";

  return (
    <div>
      <div className="flex gap-1 px-1">
        <button type="button" className={`${tabBase} ${tab === "current" ? activeTab : inactiveTab}`} onClick={() => setTab("current")}>
          Current Week
        </button>
        <button type="button" className={`${tabBase} ${tab === "next" ? activeTab : inactiveTab}`} onClick={() => setTab("next")}>
          Next Week
        </button>
      </div>
      <div className={tab === "current" ? "" : "hidden"}>{current}</div>
      <div className={tab === "next" ? "" : "hidden"}>{next}</div>
    </div>
  );
}

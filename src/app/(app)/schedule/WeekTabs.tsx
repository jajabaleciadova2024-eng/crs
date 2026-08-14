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

  // Equal halves, corner to corner — flex-1 on each button instead of
  // left-aligned auto-width tabs, so the divider between them always sits
  // exactly at the frame's midpoint regardless of label length.
  const tabBase = "flex-1 py-2.5 text-[13px] font-bold border-b-2 transition-colors text-center";
  const activeTab = "border-[var(--accent)] text-[var(--accent-strong)]";
  const inactiveTab = "border-transparent text-[var(--muted)] hover:text-[var(--ink)]";

  return (
    <div>
      <div className="flex border-b border-[var(--line)] mb-4">
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

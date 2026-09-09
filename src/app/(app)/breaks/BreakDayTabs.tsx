"use client";

import { useState, type ReactNode } from "react";

// Day switcher for the break schedule — one day's three slots at a time,
// defaulting to today so the floor opens on what's happening now.
export default function BreakDayTabs({
  days,
}: {
  days: { date: string; label: string; isToday: boolean; content: ReactNode }[];
}) {
  const todayIndex = Math.max(days.findIndex((d) => d.isToday), 0);
  const [active, setActive] = useState(todayIndex);
  const current = days[active] ?? days[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-x-tabs gap-1.5 -mx-1 px-1 pb-1" role="tablist" aria-label="Day">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors cursor-pointer border ${
              i === active
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]"
                : "text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)] hover:border-[var(--accent)]"
            }`}
          >
            {d.label}
            {d.isToday && <span className="ml-1 text-[10px] font-bold">•</span>}
          </button>
        ))}
      </div>
      {current?.content}
    </div>
  );
}

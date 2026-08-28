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
      <div className="flex gap-1 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 px-3 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer border ${
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

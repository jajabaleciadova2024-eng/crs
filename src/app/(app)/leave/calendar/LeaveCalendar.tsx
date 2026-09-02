"use client";

import { useMemo, useState } from "react";
import { Button, Pill } from "@/components/ui";
import { addMonths, monthGridDates, MONTH_LABEL, type LeaveCalendarEntry } from "@/lib/leaveCalendar";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

// The month grid is always Sunday-first (see monthGridDates, which pins the
// weekday to UTC so it never varies by device or locale) — so these labels
// must be Sunday-first too, on EVERY screen size. A separate Monday-first
// mobile set used to sit above the same Sunday-first cells, which put every
// phone's column headers one day out of step with the dates under them.
// One array, rendered once, is what keeps the two from drifting apart again.
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LeaveCalendar({
  dayMap,
  leaveTypeConfigs,
  today,
}: {
  dayMap: Record<string, LeaveCalendarEntry[]>;
  leaveTypeConfigs: LeaveTypeConfig[];
  today: string;
}) {
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dates = useMemo(() => monthGridDates(year, month), [year, month]);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  function shiftMonth(delta: number) {
    const next = addMonths(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
    setSelectedDate(null);
  }

  function typeLabel(key: string) {
    return leaveTypeConfigs.find((c) => c.key === key)?.label ?? key;
  }

  const selectedEntries = selectedDate ? (dayMap[selectedDate] ?? []) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button style={{ padding: "6px 12px" }} onClick={() => shiftMonth(-1)}>
          ← Prev
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-serif text-lg tracking-tight">
            {MONTH_LABEL[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => {
              setYear(Number(today.slice(0, 4)));
              setMonth(Number(today.slice(5, 7)));
              setSelectedDate(null);
            }}
            className="text-[11px] font-bold text-[var(--accent-strong)] hover:underline"
          >
            Today
          </button>
        </div>
        <Button style={{ padding: "6px 12px" }} onClick={() => shiftMonth(1)}>
          Next →
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-4 text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--warn)" }} /> Pending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--good)" }} /> Approved
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label + i}
            className="text-[9.5px] sm:text-[10px] uppercase tracking-normal sm:tracking-wider text-[var(--muted)] font-semibold text-center py-1.5"
          >
            {label}
          </div>
        ))}
        {dates.map((date) => {
          const entries = dayMap[date] ?? [];
          const inMonth = date.slice(0, 7) === monthKey;
          const isToday = date === today;
          const isSelected = date === selectedDate;

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelectedDate(entries.length > 0 ? date : null)}
              disabled={entries.length === 0}
              className={`flex flex-col items-start gap-1 rounded-lg border px-1.5 sm:px-2 py-1.5 sm:py-2 min-h-[56px] sm:min-h-[68px] text-left transition-all ${
                isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm" : "border-[var(--line)]"
              } ${inMonth ? "bg-[var(--paper)]" : "bg-[var(--paper-raised)] opacity-40"} ${
                entries.length > 0 ? "cursor-pointer hover:border-[var(--accent)] hover:shadow-sm active:scale-95" : "cursor-default"
              }`}
            >
              <span
                className={`text-[11.5px] leading-none ${
                  isToday
                    ? "font-bold text-white bg-[var(--accent)] w-[20px] h-[20px] sm:w-[22px] sm:h-[22px] rounded-full flex items-center justify-center"
                    : "text-[var(--muted)]"
                }`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {entries.slice(0, 4).map((e, i) => (
                  <span
                    key={`${e.id}-${i}`}
                    className="w-[5px] h-[5px] sm:w-[6px] sm:h-[6px] rounded-full"
                    style={{ background: e.status === "approved" ? "var(--good)" : "var(--warn)" }}
                  />
                ))}
                {entries.length > 4 && <span className="text-[9px] text-[var(--muted)] font-medium">+{entries.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-5 border-t border-[var(--line)] pt-4 animate-fade-in-up">
          <div className="text-xs font-bold mb-3 text-[var(--ink)]">
            On leave — {selectedDate}
          </div>
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-[var(--muted)] m-0">No one is on leave this day.</p>
          ) : (
            <ul className="flex flex-col gap-2 m-0 p-0 list-none">
              {selectedEntries.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-sm bg-[var(--paper)] rounded-lg px-3 py-2 border border-[var(--line)]">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-[var(--muted)] capitalize text-xs">{typeLabel(e.leaveType)}</span>
                  <Pill tone={e.status === "approved" ? "good" : "warn"}>{e.status === "approved" ? "Approved" : "Pending"}</Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

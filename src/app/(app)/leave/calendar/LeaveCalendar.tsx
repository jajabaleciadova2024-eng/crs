"use client";

import { useMemo, useState } from "react";
import { Button, Pill } from "@/components/ui";
import { addMonths, monthGridDates, MONTH_LABEL, type LeaveCalendarEntry } from "@/lib/leaveCalendar";
import type { LeaveTypeConfig } from "@/lib/leaveTypes";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      <div className="flex items-center justify-between mb-3">
        <Button style={{ padding: "5px 10px" }} onClick={() => shiftMonth(-1)}>
          ← Prev
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-serif text-base">
            {MONTH_LABEL[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => {
              setYear(Number(today.slice(0, 4)));
              setMonth(Number(today.slice(5, 7)));
              setSelectedDate(null);
            }}
            className="text-[11px] font-bold text-[var(--accent-strong)]"
          >
            Today
          </button>
        </div>
        <Button style={{ padding: "5px 10px" }} onClick={() => shiftMonth(1)}>
          Next →
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-3 text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--warn)" }} /> Pending
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--good)" }} /> Approved
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold text-center py-1">
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
              className={`flex flex-col items-start gap-1 rounded border px-1.5 py-1.5 min-h-[64px] text-left transition-colors ${
                isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)]"
              } ${inMonth ? "bg-[var(--paper)]" : "bg-[var(--paper-raised)] opacity-50"} ${
                entries.length > 0 ? "cursor-pointer hover:border-[var(--accent)]" : "cursor-default"
              }`}
            >
              <span
                className={`text-[11.5px] ${isToday ? "font-bold text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}
              >
                {Number(date.slice(8, 10))}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {entries.slice(0, 4).map((e, i) => (
                  <span
                    key={`${e.id}-${i}`}
                    className="w-[6px] h-[6px] rounded-full"
                    style={{ background: e.status === "approved" ? "var(--good)" : "var(--warn)" }}
                  />
                ))}
                {entries.length > 4 && <span className="text-[9.5px] text-[var(--muted)]">+{entries.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <div className="text-xs font-bold mb-2">
            On leave — {selectedDate}
          </div>
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-[var(--muted)] m-0">No one is on leave this day.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
              {selectedEntries.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex items-center gap-2 text-sm">
                  <span>{e.name}</span>
                  <span className="text-[var(--muted)] capitalize">{typeLabel(e.leaveType)}</span>
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

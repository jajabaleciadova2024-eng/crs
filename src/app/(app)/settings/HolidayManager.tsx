"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";

type Holiday = { date: string; name: string };

export default function HolidayManager({ holidays: initial }: { holidays: Holiday[] }) {
  const [holidays, setHolidays] = useState(initial);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  async function addHoliday() {
    if (!date || !name.trim()) { setError("Date and name are required"); return; }
    setError("");
    const res = await fetch("/api/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name: name.trim() }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setHolidays((h) => [...h, { date, name: name.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setDate("");
    setName("");
    startTransition(() => router.refresh());
  }

  async function removeHoliday(d: string) {
    const res = await fetch("/api/holidays", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: d }),
    });
    if (!res.ok) return;
    setHolidays((h) => h.filter((x) => x.date !== d));
    startTransition(() => router.refresh());
  }

  // Group by year for display
  const byYear = new Map<number, Holiday[]>();
  for (const h of holidays) {
    const y = Number(h.date.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(h);
  }

  const formatDate = (d: string) => {
    const [, m, day] = d.split("-");
    const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m)]} ${Number(day)}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Holidays you set here override generated schedules — no assignments on these dates. 
        Members see holidays on their schedule and dashboard skips them for the next workday.
      </p>

      {/* Add form */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Holiday name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Peñafrancia Festival"
            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm bg-[var(--paper)] text-[var(--ink)]"
          />
        </div>
        <Button onClick={addHoliday} disabled={pending}>Add Holiday</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* List */}
      {holidays.length === 0 ? (
        <p className="text-sm text-[var(--muted)] italic">No holidays set yet.</p>
      ) : (
        <div className="space-y-4">
          {Array.from(byYear.entries()).map(([year, list]) => (
            <div key={year}>
              <h4 className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">{year}</h4>
              <div className="space-y-1.5">
                {list.map((h) => (
                  <div key={h.date} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <Pill tone="warn">{formatDate(h.date)}</Pill>
                      <span className="text-sm text-[var(--ink)] truncate">{h.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHoliday(h.date)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

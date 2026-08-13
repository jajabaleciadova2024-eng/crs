// Pure calendar-grid math for the read-only "who's on leave" calendar
// (src/app/(app)/leave/calendar) — kept dependency-free from Supabase so
// it's cheap to unit test.

import { addDays } from "./scheduleDates";

export type LeaveCalendarEntry = {
  id: string;
  name: string;
  leaveType: string;
  status: "pending" | "approved";
};

export type LeaveCalendarRequest = {
  id: string;
  name: string;
  leave_type: string;
  status: "pending" | "approved";
  ranges: { start_date: string; end_date: string }[];
};

// Expands every request's date range(s) into one entry per calendar day,
// keyed by YYYY-MM-DD, so the calendar can just look up `map[dateStr]`.
export function buildLeaveDayMap(requests: LeaveCalendarRequest[]): Record<string, LeaveCalendarEntry[]> {
  const map: Record<string, LeaveCalendarEntry[]> = {};
  for (const r of requests) {
    for (const range of r.ranges) {
      let d = range.start_date;
      // Guard against a malformed/inverted range looping forever.
      let iterations = 0;
      while (d <= range.end_date && iterations < 366) {
        (map[d] ??= []).push({ id: r.id, name: r.name, leaveType: r.leave_type, status: r.status });
        d = addDays(d, 1);
        iterations++;
      }
    }
  }
  return map;
}

// Monday-start 6-week (42-day) grid of YYYY-MM-DD strings covering the
// given month (1-indexed), padded with the trailing/leading days of
// adjacent months so every displayed week is complete.
export function monthGridDates(year: number, month: number): string[] {
  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const firstWeekday = new Date(`${firstOfMonth}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const leadingDays = firstWeekday === 0 ? 6 : firstWeekday - 1; // days before this Monday
  const gridStart = addDays(firstOfMonth, -leadingDays);

  const dates: string[] = [];
  let d = gridStart;
  for (let i = 0; i < 42; i++) {
    dates.push(d);
    d = addDays(d, 1);
  }
  return dates;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

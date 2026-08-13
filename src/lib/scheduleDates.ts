// Date helpers keyed to Philippine time (Asia/Manila, UTC+8, no DST) rather
// than the server's local/UTC clock — Vercel's servers run UTC, which could
// put "today" a day off from what a PH-based Team Leader expects, especially
// late at night / early morning PH time. All schedule-week math should route
// through these instead of `new Date()` directly.

const MANILA_TZ = "Asia/Manila";

// Returns today's date as YYYY-MM-DD in Asia/Manila, regardless of the
// server's own timezone.
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(new Date());
}

function toDate(dateStr: string): Date {
  // Parsed as UTC midnight — fine since we only ever do calendar-day
  // arithmetic (add/subtract whole days), never time-of-day math, on these.
  return new Date(`${dateStr}T00:00:00Z`);
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

// Monday of the work week containing `dateStr` (defaults to today in Manila).
export function startOfWorkWeek(dateStr: string = todayInManila()): string {
  const d = toDate(dateStr);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateString(d);
}

// The work week is Monday–Friday (not the full calendar week) — schedule
// assignments and "on leave" overlap checks are scoped to workdays only.
export function endOfWorkWeek(weekStartDateStr: string): string {
  return addDays(weekStartDateStr, 4);
}

// The Monday (00:00 Manila) that starts the leave Queue's current display
// window: decided (approved/rejected) requests stay visible in the Queue
// through the weekend and only roll over into History once Monday 8am
// Manila time has passed. Before 8am on a Monday, last week's decisions
// haven't rolled over yet, so the boundary is still the previous Monday.
export function currentQueueWeekStart(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));

  const weekStart = startOfWorkWeek(dateStr);
  if (dateStr === weekStart && hour < 8) {
    return addDays(weekStart, -7);
  }
  return weekStart;
}

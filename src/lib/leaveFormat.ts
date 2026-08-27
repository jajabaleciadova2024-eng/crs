// Shared leave-request display formatting so the Queue and History tables
// render identically — same date format, same "N/A" document rules, etc.
// (Queue and History are meant to be mirrors of each other, just filtered
// to a different time window; see leave/page.tsx and leave/history/page.tsx.)

export type LeaveDateRange = { start_date: string; end_date: string };

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Splits a YYYY-MM-DD string without going through Date — these are plain
// calendar days, and parsing them as Date would drag the server's timezone
// into a value that has none (a UTC-midnight parse renders as the previous
// day anywhere west of UTC).
function parts(dateStr: string): { year: string; month: string; day: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return { year: m[1], month: m[2], day: m[3] };
}

function monthName(month: string): string {
  return MONTH_ABBR[Number(month) - 1] ?? month;
}

// One date as "Mar-08-2026".
export function formatLeaveDate(dateStr: string): string {
  const p = parts(dateStr);
  if (!p) return dateStr;
  return `${monthName(p.month)}-${p.day}-${p.year}`;
}

// A single date or range, collapsing whatever the two ends share:
//   same day                  -> Mar-08-2026
//   same month and year       -> Mar-08-10-2026
//   same year, months differ  -> Mar-30-Apr-02-2026
//   years differ              -> Dec-30-2026-Jan-02-2027
export function formatLeaveRange(range: LeaveDateRange): string {
  const start = parts(range.start_date);
  const end = parts(range.end_date);
  if (!start || !end) {
    return range.start_date === range.end_date ? range.start_date : `${range.start_date} – ${range.end_date}`;
  }

  if (range.start_date === range.end_date) {
    return `${monthName(start.month)}-${start.day}-${start.year}`;
  }
  if (start.year !== end.year) {
    return `${monthName(start.month)}-${start.day}-${start.year}-${monthName(end.month)}-${end.day}-${end.year}`;
  }
  if (start.month !== end.month) {
    return `${monthName(start.month)}-${start.day}-${monthName(end.month)}-${end.day}-${start.year}`;
  }
  return `${monthName(start.month)}-${start.day}-${end.day}-${start.year}`;
}

// Lists every date/range in full — a Team Leader approving leave needs the
// exact dates, not a truncated "+N more" summary.
export function formatLeaveRanges(primary: LeaveDateRange, extra: LeaveDateRange[]): string {
  return [primary, ...extra].map(formatLeaveRange).join(", ");
}

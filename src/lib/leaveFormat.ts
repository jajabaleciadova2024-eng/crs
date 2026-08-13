// Shared leave-request display formatting so the Queue and History tables
// render identically — same date format, same "N/A" document rules, etc.
// (Queue and History are meant to be mirrors of each other, just filtered
// to a different time window; see leave/page.tsx and leave/history/page.tsx.)

export type LeaveDateRange = { start_date: string; end_date: string };

// Lists every date/range in full — a Team Leader approving leave needs the
// exact dates, not a truncated "+N more" summary.
export function formatLeaveRanges(primary: LeaveDateRange, extra: LeaveDateRange[]): string {
  const all = [primary, ...extra];
  const label = (r: LeaveDateRange) => (r.start_date === r.end_date ? r.start_date : `${r.start_date} – ${r.end_date}`);
  return all.map(label).join(", ");
}

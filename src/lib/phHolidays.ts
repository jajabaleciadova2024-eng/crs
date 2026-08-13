// Philippine regular holidays (Republic Act No. 9849 + annual proclamations).
// Computed where possible (fixed dates, Easter-based movable dates, "last
// Monday of August"); Eid'l Fitr and Eid'l Adha are lunar-calendar and only
// fixed by Presidential Proclamation each year, so they can't be computed —
// add announced dates to MANUALLY_ANNOUNCED_HOLIDAYS below once known.

export type Holiday = { date: string; name: string };

const MANUALLY_ANNOUNCED_HOLIDAYS: Holiday[] = [
  // { date: "2026-03-20", name: "Eid'l Fitr" },
  // { date: "2026-05-27", name: "Eid'l Adha" },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Anonymous Gregorian algorithm — returns Easter Sunday's date for `year`.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Last Monday of August, for National Heroes Day.
function lastMondayOfAugust(year: number): string {
  const d = new Date(Date.UTC(year, 7, 31)); // Aug 31
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 1 ? 0 : day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateString(d);
}

export function getPhilippineHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);

  const fixed: Holiday[] = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-04-09`, name: "Araw ng Kagitingan" },
    { date: toDateString(addDays(easter, -3)), name: "Maundy Thursday" },
    { date: toDateString(addDays(easter, -2)), name: "Good Friday" },
    { date: `${year}-05-01`, name: "Labor Day" },
    { date: `${year}-06-12`, name: "Independence Day" },
    { date: lastMondayOfAugust(year), name: "National Heroes Day" },
    { date: `${year}-11-30`, name: "Bonifacio Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
    { date: `${year}-12-30`, name: "Rizal Day" },
  ];

  const announced = MANUALLY_ANNOUNCED_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`));

  return [...fixed, ...announced].sort((a, b) => a.date.localeCompare(b.date));
}

// Holidays overlapping [startDate, endDate] (inclusive, YYYY-MM-DD).
export function holidaysInRange(startDate: string, endDate: string): Holiday[] {
  const years = new Set([Number(startDate.slice(0, 4)), Number(endDate.slice(0, 4))]);
  const all = Array.from(years).flatMap((y) => getPhilippineHolidays(y));
  return all.filter((h) => h.date >= startDate && h.date <= endDate);
}

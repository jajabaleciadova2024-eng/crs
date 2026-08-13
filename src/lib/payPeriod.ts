// Semi-monthly grouping used for the Team Leader's approved-leave history:
// the 1st–15th and the 16th–end-of-month of each calendar month.

export type PayPeriod = { key: string; label: string; startDate: string; endDate: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number) {
  // month is 1-indexed; day 0 of the next month = last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Given a YYYY-MM-DD date string, returns which semi-monthly period it
// falls in.
export function getPayPeriod(dateStr: string): PayPeriod {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const monthName = MONTH_NAMES[month - 1];

  if (day <= 15) {
    return {
      key: `${yearStr}-${monthStr}-A`,
      label: `${monthName} 1–15, ${year}`,
      startDate: `${yearStr}-${monthStr}-01`,
      endDate: `${yearStr}-${monthStr}-15`,
    };
  }

  const lastDay = lastDayOfMonth(year, month);
  return {
    key: `${yearStr}-${monthStr}-B`,
    label: `${monthName} 16–${lastDay}, ${year}`,
    startDate: `${yearStr}-${monthStr}-16`,
    endDate: `${yearStr}-${monthStr}-${pad(lastDay)}`,
  };
}

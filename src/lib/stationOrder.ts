// The Team Leader's standing operational order for listing workstations —
// used everywhere stations are displayed as a group/list (dashboard
// assignments, Weekly Schedule's assignment table, the Generate modal's
// quota table) so they always appear in the same, expected sequence
// instead of alphabetically. Matched case-insensitively against the
// station's name; anything not listed here sorts after all of these, in
// alphabetical order among themselves.
const STATION_ORDER = [
  "screener",
  "collecting officer",
  "premium annotation",
  "releasing officer",
  "pacd",
  "electronic endorsement",
];

function stationOrderIndex(name: string): number {
  const idx = STATION_ORDER.indexOf(name.trim().toLowerCase());
  return idx === -1 ? STATION_ORDER.length : idx;
}

// Comparator for Array.prototype.sort — stations in the standing order
// first (in that order), then anything else alphabetically.
export function compareStationNames(a: string, b: string): number {
  const diff = stationOrderIndex(a) - stationOrderIndex(b);
  return diff !== 0 ? diff : a.localeCompare(b);
}

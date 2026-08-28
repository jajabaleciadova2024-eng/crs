// Window labels are text ("27", "10", "EE") because not every window is
// numbered — Electronic Endorsement's is literally "EE". Plain string sorting
// would put "10" before "8" and bury nothing usefully, so numeric labels sort
// numerically and ahead of non-numeric ones, which sort alphabetically after.

function numericValue(label: string): number | null {
  const trimmed = label.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function compareWindowLabels(a: string, b: string): number {
  const na = numericValue(a);
  const nb = numericValue(b);
  if (na !== null && nb !== null) return na - nb;
  // Numbered windows first, then named ones (EE) alphabetically.
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a.localeCompare(b);
}

export function sortWindows<T extends { label: string }>(windows: T[]): T[] {
  return [...windows].sort((a, b) => compareWindowLabels(a.label, b.label));
}

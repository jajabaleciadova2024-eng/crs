// Pure assignment logic for the weekly auto-shuffle, kept dependency-free
// (no Supabase imports) so it's directly unit-testable.
//
// Rule: associates flagged `is_immune` keep whatever station they held the
// previous week (if that station still exists/is active) — they're excluded
// from shuffling. Every other active station gets filled by shuffling the
// remaining non-immune associates across the remaining open stations.
//
// Tenure grouping (see profiles.tenure_group) is captured but NOT yet
// consumed here — the exact rule for how tenured vs. new-hire associates
// should be treated is still TBD (see README "Known gaps").

export type ShuffleWorkstation = { id: string };
export type ShuffleAssociate = { id: string; is_immune: boolean };
export type PreviousAssignment = { workstation_id: string; associate_id: string };
export type NewAssignment = { workstation_id: string; associate_id: string };

// Simple in-place Fisher-Yates shuffle. `rand` is injectable for deterministic
// tests; defaults to Math.random for real use.
function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateAssignments(
  workstations: ShuffleWorkstation[],
  associates: ShuffleAssociate[],
  previousAssignments: PreviousAssignment[],
  rand: () => number = Math.random
): NewAssignment[] {
  const stationIds = new Set(workstations.map((w) => w.id));
  const associateIds = new Set(associates.map((a) => a.id));
  const previousStationByAssociate = new Map(previousAssignments.map((p) => [p.associate_id, p.workstation_id]));

  const result: NewAssignment[] = [];
  const claimedStations = new Set<string>();

  // Pin immune associates to their previous station, if it's still valid and
  // not already taken (defensive against duplicate/stale data).
  for (const associate of associates) {
    if (!associate.is_immune) continue;
    const prevStation = previousStationByAssociate.get(associate.id);
    if (prevStation && stationIds.has(prevStation) && !claimedStations.has(prevStation)) {
      result.push({ workstation_id: prevStation, associate_id: associate.id });
      claimedStations.add(prevStation);
    }
  }

  const pinnedAssociateIds = new Set(result.map((r) => r.associate_id));
  const openStations = shuffle(
    workstations.filter((w) => !claimedStations.has(w.id)),
    rand
  );
  const freeAssociates = shuffle(
    associates.filter((a) => !pinnedAssociateIds.has(a.id) && associateIds.has(a.id)),
    rand
  );

  const pairCount = Math.min(openStations.length, freeAssociates.length);
  for (let i = 0; i < pairCount; i++) {
    result.push({ workstation_id: openStations[i].id, associate_id: freeAssociates[i].id });
  }

  return result;
}

// Pure assignment logic for the weekly auto-shuffle, kept dependency-free
// (no Supabase imports) so it's directly unit-testable.
//
// Rule: associates flagged `is_immune` keep whatever station they held the
// previous week (if that station still exists/is active) — they're excluded
// from shuffling.
//
// Two modes:
//  - No `quotas` given: legacy behavior, exactly one associate per station,
//    no tenure preference (unchanged from before — kept so existing callers
//    and tests don't need to know about quotas at all).
//  - `quotas` given: the Team Leader has set a target headcount per station
//    (via the "Generate next week" quota modal), plus how many of that
//    headcount should be Tenured vs. New Hire. Immune carryover still
//    happens first (counts toward that station's headcount); remaining
//    slots are filled tenured-then-new-hire from shuffled pools, then any
//    still-open slots get filled from whoever's left over regardless of
//    tenure — better to have coverage than an empty seat if the quota
//    under-specifies who's available.

export type ShuffleWorkstation = { id: string };
export type ShuffleAssociate = { id: string; is_immune: boolean; tenure_group?: "new_hire" | "tenured" };
export type PreviousAssignment = { workstation_id: string; associate_id: string };
export type NewAssignment = { workstation_id: string; associate_id: string };
export type StationQuota = { workstation_id: string; headcount: number; tenured: number; newHire: number };

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
  rand: () => number = Math.random,
  quotas?: StationQuota[]
): NewAssignment[] {
  const stationIds = new Set(workstations.map((w) => w.id));
  const associateIds = new Set(associates.map((a) => a.id));
  const previousStationByAssociate = new Map(previousAssignments.map((p) => [p.associate_id, p.workstation_id]));

  if (!quotas) {
    // ---- Legacy path: one seat per station, no tenure preference. ----
    const result: NewAssignment[] = [];
    const claimedStations = new Set<string>();

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

  // ---- Quota path: headcount + tenure/new-hire targets per station. ----
  const quotaByStation = new Map(quotas.map((q) => [q.workstation_id, q]));
  const result: NewAssignment[] = [];
  const assignedAssociateIds = new Set<string>();
  const stationFillCount = new Map<string, number>();

  function headcountFor(workstationId: string): number {
    return quotaByStation.get(workstationId)?.headcount ?? 1;
  }

  // Immune carryover — fills one headcount slot on the associate's previous
  // station, if that station still exists and has room under its quota.
  for (const associate of associates) {
    if (!associate.is_immune) continue;
    const prevStation = previousStationByAssociate.get(associate.id);
    if (!prevStation || !stationIds.has(prevStation)) continue;
    const filled = stationFillCount.get(prevStation) ?? 0;
    if (filled >= headcountFor(prevStation)) continue;
    result.push({ workstation_id: prevStation, associate_id: associate.id });
    assignedAssociateIds.add(associate.id);
    stationFillCount.set(prevStation, filled + 1);
  }

  const remainingTenured = shuffle(
    associates.filter((a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id) && a.tenure_group === "tenured"),
    rand
  );
  const remainingNewHire = shuffle(
    associates.filter((a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id) && a.tenure_group === "new_hire"),
    rand
  );

  const shuffledStations = shuffle(workstations, rand);

  for (const ws of shuffledStations) {
    const quota = quotaByStation.get(ws.id) ?? { workstation_id: ws.id, headcount: 1, tenured: 0, newHire: 0 };
    let filled = stationFillCount.get(ws.id) ?? 0;

    let need = quota.headcount - filled;
    const takeTenured = Math.min(quota.tenured, remainingTenured.length, Math.max(need, 0));
    for (let i = 0; i < takeTenured; i++) {
      const person = remainingTenured.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }

    need = quota.headcount - filled;
    const takeNewHire = Math.min(quota.newHire, remainingNewHire.length, Math.max(need, 0));
    for (let i = 0; i < takeNewHire; i++) {
      const person = remainingNewHire.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }

    stationFillCount.set(ws.id, filled);
  }

  // Fallback fill: any still-open headcount slots get whoever's left,
  // regardless of tenure — coverage beats an empty seat.
  const leftover = shuffle(
    associates.filter((a) => associateIds.has(a.id) && !assignedAssociateIds.has(a.id)),
    rand
  );
  for (const ws of shuffledStations) {
    const quota = quotaByStation.get(ws.id) ?? { workstation_id: ws.id, headcount: 1, tenured: 0, newHire: 0 };
    let filled = stationFillCount.get(ws.id) ?? 0;
    while (filled < quota.headcount && leftover.length > 0) {
      const person = leftover.shift()!;
      result.push({ workstation_id: ws.id, associate_id: person.id });
      assignedAssociateIds.add(person.id);
      filled++;
    }
    stationFillCount.set(ws.id, filled);
  }

  return result;
}

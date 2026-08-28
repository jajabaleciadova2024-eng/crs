// Break-time scheduling.
//
// Three staggered slots (10 AM, 11 AM, 12 PM). WINDOWS go on break, not
// people: whoever is seated at a window that day takes that window's slot.
//
// The one rule everything else serves: a station is never left unmanned. So
// breaks are spread across the three slots rather than assigned freely, and a
// window that WOULD leave its station empty only breaks if a reliever can
// cover it.
//
// Pure and deterministic given `rand`, same as src/lib/schedule.ts — the API
// route does the I/O, this just decides.

export const BREAK_SLOTS = ["10:00", "11:00", "12:00"] as const;
export type BreakSlot = (typeof BREAK_SLOTS)[number];

export const BREAK_SLOT_LABEL: Record<BreakSlot, string> = {
  "10:00": "10 AM",
  "11:00": "11 AM",
  "12:00": "12 PM",
};

export type BreakStation = {
  id: string;
  name: string;
  /** Lower = manned first, protected hardest. Null = no special priority. */
  man_priority: number | null;
  /** Screeners can be borrowed to cover other stations. */
  can_be_pulled: boolean;
  /** Electronic Endorsement floats and covers whoever is on break. */
  is_reliever: boolean;
  /** Fewest windows that must stay manned at any moment. */
  min_manned: number;
};

export type SeatedWindow = {
  window_id: string;
  window_label: string;
  workstation_id: string;
  associate_id: string;
  /** Break-immune members keep whatever slot they already had. */
  is_break_immune: boolean;
  /** Pre-existing slot, honoured when the member is break-immune. */
  locked_slot?: BreakSlot | null;
};

export type BreakAssignment = {
  window_id: string;
  associate_id: string;
  break_slot: BreakSlot;
  /** Set when the window would otherwise be left uncovered. */
  reliever_associate_id: string | null;
};

// Fisher-Yates against the injected rand, so a seeded generator reproduces.
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// How many of a station's windows may be on break simultaneously. Never so
// many that fewer than min_manned are left, and never the whole station.
function maxConcurrent(station: BreakStation, seatedCount: number): number {
  if (seatedCount <= 0) return 0;
  const allowed = seatedCount - Math.max(1, station.min_manned);
  // A single-window station can still break — but only with a reliever, which
  // assignBreaks checks separately.
  return Math.max(allowed, 0);
}

/**
 * Assign every seated window a break slot for one day.
 *
 * Windows whose station would be left unmanned are given a reliever drawn
 * from the reliever pool (Electronic Endorsement) or from a pullable station
 * (Screeners) that can spare someone. A window that needs a reliever and
 * can't get one keeps working — deliberately: coverage beats a break.
 */
export function assignDayBreaks(
  seated: SeatedWindow[],
  stations: BreakStation[],
  rand: () => number = Math.random,
): BreakAssignment[] {
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const byStation = new Map<string, SeatedWindow[]>();
  for (const w of seated) {
    byStation.set(w.workstation_id, [...(byStation.get(w.workstation_id) ?? []), w]);
  }

  // Relievers: whoever is seated at a floating-reliever station (EE). They
  // cover other windows, so they don't hold a normal station slot.
  const relieverPool: SeatedWindow[] = [];
  for (const [stationId, windows] of byStation) {
    if (stationById.get(stationId)?.is_reliever) relieverPool.push(...windows);
  }

  // Screeners and anyone else marked pullable can be borrowed as a fallback
  // reliever — but only down to their own min_manned, so the floor keeps at
  // least one screener at all times.
  const pullablePool: SeatedWindow[] = [];
  for (const [stationId, windows] of byStation) {
    const station = stationById.get(stationId);
    if (!station?.can_be_pulled) continue;
    const spare = windows.length - Math.max(1, station.min_manned);
    if (spare > 0) pullablePool.push(...shuffled(windows, rand).slice(0, spare));
  }

  // How many relief bodies are free in each slot. A reliever can cover one
  // window per slot.
  const relieverCapacity: Record<BreakSlot, string[]> = {
    "10:00": [...relieverPool, ...pullablePool].map((w) => w.associate_id),
    "11:00": [...relieverPool, ...pullablePool].map((w) => w.associate_id),
    "12:00": [...relieverPool, ...pullablePool].map((w) => w.associate_id),
  };

  const result: BreakAssignment[] = [];
  const slotLoad: Record<BreakSlot, number> = { "10:00": 0, "11:00": 0, "12:00": 0 };

  // Priority stations first: they get the earliest, least contended slots and
  // first call on relievers. Unprioritised stations sort after, by name for
  // determinism.
  const orderedStations = [...byStation.keys()].sort((a, b) => {
    const sa = stationById.get(a);
    const sb = stationById.get(b);
    const pa = sa?.man_priority ?? Number.MAX_SAFE_INTEGER;
    const pb = sb?.man_priority ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return (sa?.name ?? "").localeCompare(sb?.name ?? "");
  });

  for (const stationId of orderedStations) {
    const station = stationById.get(stationId);
    const windows = byStation.get(stationId) ?? [];
    if (!station) continue;

    // The reliever station itself breaks freely — it holds no fixed post, so
    // nothing is left unmanned when it steps away.
    if (station.is_reliever) {
      for (const w of windows) {
        const slot = w.is_break_immune && w.locked_slot ? w.locked_slot : leastLoadedSlot(slotLoad);
        slotLoad[slot] += 1;
        result.push({ window_id: w.window_id, associate_id: w.associate_id, break_slot: slot, reliever_associate_id: null });
      }
      continue;
    }

    const perSlotCap = maxConcurrent(station, windows.length);
    const usedInSlot: Record<BreakSlot, number> = { "10:00": 0, "11:00": 0, "12:00": 0 };

    // Break-immune members keep their existing slot; everyone else is
    // shuffled so the same person doesn't always land on the 10 AM break.
    const immune = windows.filter((w) => w.is_break_immune && w.locked_slot);
    const flexible = shuffled(windows.filter((w) => !(w.is_break_immune && w.locked_slot)), rand);

    for (const w of immune) {
      const slot = w.locked_slot as BreakSlot;
      usedInSlot[slot] += 1;
      slotLoad[slot] += 1;
      result.push({ window_id: w.window_id, associate_id: w.associate_id, break_slot: slot, reliever_associate_id: null });
    }

    for (const w of flexible) {
      // Prefer the slot where this station is least exposed, breaking ties by
      // overall load so the three slots stay balanced across the floor.
      const candidates = [...BREAK_SLOTS].sort((a, b) => {
        if (usedInSlot[a] !== usedInSlot[b]) return usedInSlot[a] - usedInSlot[b];
        return slotLoad[a] - slotLoad[b];
      });

      let placed = false;
      for (const slot of candidates) {
        const wouldExceed = usedInSlot[slot] + 1 > perSlotCap;
        if (!wouldExceed) {
          usedInSlot[slot] += 1;
          slotLoad[slot] += 1;
          result.push({ window_id: w.window_id, associate_id: w.associate_id, break_slot: slot, reliever_associate_id: null });
          placed = true;
          break;
        }
        // Over cap — only allowed if someone can physically cover the window.
        const reliever = relieverCapacity[slot].find((id) => id !== w.associate_id);
        if (reliever) {
          relieverCapacity[slot] = relieverCapacity[slot].filter((id) => id !== reliever);
          usedInSlot[slot] += 1;
          slotLoad[slot] += 1;
          result.push({ window_id: w.window_id, associate_id: w.associate_id, break_slot: slot, reliever_associate_id: reliever });
          placed = true;
          break;
        }
      }

      // No slot and no reliever: this window works through. Coverage wins.
      if (!placed) continue;
    }
  }

  return result;
}

function leastLoadedSlot(load: Record<BreakSlot, number>): BreakSlot {
  return [...BREAK_SLOTS].sort((a, b) => load[a] - load[b])[0];
}

/** Windows a station has on break in a given slot — used for coverage warnings. */
export function coverageForSlot(
  seated: SeatedWindow[],
  breaks: BreakAssignment[],
  slot: BreakSlot,
): Map<string, { total: number; onBreak: number }> {
  const onBreakWindows = new Set(breaks.filter((b) => b.break_slot === slot).map((b) => b.window_id));
  const out = new Map<string, { total: number; onBreak: number }>();
  for (const w of seated) {
    const current = out.get(w.workstation_id) ?? { total: 0, onBreak: 0 };
    current.total += 1;
    if (onBreakWindows.has(w.window_id)) current.onBreak += 1;
    out.set(w.workstation_id, current);
  }
  return out;
}

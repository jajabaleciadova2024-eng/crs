"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";
import { startOfWorkWeek, formatWeekRange, workDatesForWeek, weekdayShortLabel } from "@/lib/scheduleDates";

type Workstation = { id: string; name: string; headcount: number };
type ImmuneMember = { id: string; name: string };
// Headcount is fixed per station (set on the Workstations page) — this
// modal only lets the Team Leader decide how to split that fixed number
// into Tenured vs. New Hire, not change the number itself.
type QuotaRow = { tenured: number; newHire: number };

// Team Leader's standing rule for how many of each station's fixed seats
// should default to Tenured — saves re-typing the same split every week.
// Matched case-insensitively against the station's name; anything not
// listed here (including future/renamed stations) defaults to 0 tenured,
// i.e. entirely New Hire, same as "the rest is new hires" below.
const DEFAULT_TENURED_BY_STATION: Record<string, number> = {
  screener: 1,
  "collecting officer": 3,
  "releasing officer": 2,
  "electronic endorsement": 1,
  "premium annotation": 1,
};

function defaultQuotaRow(w: Workstation): QuotaRow {
  const tenured = Math.min(DEFAULT_TENURED_BY_STATION[w.name.trim().toLowerCase()] ?? 0, w.headcount);
  return { tenured, newHire: Math.max(w.headcount - tenured, 0) };
}

export default function GenerateButton({
  workstations,
  totalMembers,
  totalTenured,
  totalNewHire,
  immuneMembers,
  defaultWeekStart,
}: {
  workstations: Workstation[];
  totalMembers: number;
  totalTenured: number;
  totalNewHire: number;
  immuneMembers: ImmuneMember[];
  // Prefilled into the (editable) week picker below — the earliest week
  // that isn't already scheduled, same as the old auto-picked "next
  // week" behavior, but now just a starting suggestion instead of the
  // only option.
  defaultWeekStart: string;
}) {
  const [open, setOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [rows, setRows] = useState<Record<string, QuotaRow>>(() =>
    Object.fromEntries(workstations.map((w) => [w.id, defaultQuotaRow(w)]))
  );
  // Immune placement is now day-scoped: a station PLUS which of the week's
  // 5 workdays (not necessarily all of them) they're pinned there for.
  const [immunePlacements, setImmunePlacements] = useState<Record<string, { workstationId: string; dates: string[] }>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const workDates = useMemo(() => workDatesForWeek(weekStart), [weekStart]);

  const fixedHeadcount = useMemo(() => workstations.reduce((sum, w) => sum + w.headcount, 0), [workstations]);

  const totals = useMemo(() => {
    let tenured = 0;
    let newHire = 0;
    for (const r of Object.values(rows)) {
      tenured += r.tenured;
      newHire += r.newHire;
    }
    return { tenured, newHire };
  }, [rows]);

  const unplacedImmune = immuneMembers.filter((m) => !immunePlacements[m.id]?.workstationId || (immunePlacements[m.id]?.dates.length ?? 0) === 0);

  // Catches an over-full station BEFORE submitting, not just after the
  // server rejects it — if more immune members are pointed at the same
  // station on the same day than it has seats for, some of them can't
  // actually be honored there, which the API refuses to silently paper
  // over (see the route's own validation). Checked per (station, date) now,
  // not just per station, since a station can be over capacity on one day
  // and fine on another.
  const immuneOverflow = useMemo(() => {
    const countByStationDate = new Map<string, number>();
    for (const m of immuneMembers) {
      const placement = immunePlacements[m.id];
      if (!placement?.workstationId) continue;
      for (const date of placement.dates) {
        const key = `${placement.workstationId}::${date}`;
        countByStationDate.set(key, (countByStationDate.get(key) ?? 0) + 1);
      }
    }
    const overflows: { name: string; date: string; placed: number; headcount: number }[] = [];
    for (const w of workstations) {
      for (const date of workDates) {
        const placed = countByStationDate.get(`${w.id}::${date}`) ?? 0;
        if (placed > w.headcount) overflows.push({ name: w.name, date, placed, headcount: w.headcount });
      }
    }
    return overflows;
  }, [immuneMembers, immunePlacements, workstations, workDates]);

  function updateRow(id: string, field: keyof QuotaRow, value: number) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: Math.max(0, value) } }));
  }

  function updateImmuneStation(memberId: string, workstationId: string) {
    setImmunePlacements((prev) => ({ ...prev, [memberId]: { workstationId, dates: prev[memberId]?.dates ?? [] } }));
  }

  function toggleImmuneDate(memberId: string, date: string) {
    setImmunePlacements((prev) => {
      const current = prev[memberId] ?? { workstationId: "", dates: [] };
      const dates = current.dates.includes(date) ? current.dates.filter((d) => d !== date) : [...current.dates, date];
      return { ...prev, [memberId]: { ...current, dates } };
    });
  }

  // Whatever day the Team Leader actually clicks in the date picker,
  // snap it to the Monday of that work week — the API route normalizes
  // the same way, so this just keeps what's displayed here honest about
  // what week will actually get generated instead of silently differing
  // from the submitted value.
  //
  // Also clears every immune member's checked days: they're checkboxes
  // against THIS week's actual calendar dates (e.g. 2026-08-24), not just
  // "Monday" in the abstract — carrying them over to a different week
  // would silently submit dates that don't belong to the new target week,
  // which the API correctly rejects but with a confusing "day outside
  // this week" error instead of just... not happening. The station choice
  // itself is kept, only the day picks reset.
  function handleWeekChange(value: string) {
    if (!value) return;
    setWeekStart(startOfWorkWeek(value));
    setImmunePlacements((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, p]) => [id, { ...p, dates: [] }]))
    );
  }

  function generate() {
    setError(null);
    if (unplacedImmune.length > 0) {
      setError(`Place every immune member at a station first — still missing: ${unplacedImmune.map((m) => m.name).join(", ")}`);
      return;
    }
    if (immuneOverflow.length > 0) {
      setError(
        `Too many immune members placed at the same station on the same day: ${immuneOverflow
          .map((o) => `${o.name} on ${weekdayShortLabel(o.date)} (${o.placed} placed, only ${o.headcount} seat${o.headcount === 1 ? "" : "s"})`)
          .join("; ")}. Move some to a different station/day, or increase that station's headcount on Workstations.`
      );
      return;
    }

    const quotas = workstations.map((w) => ({
      workstation_id: w.id,
      headcount: w.headcount,
      tenured: rows[w.id]?.tenured ?? 0,
      newHire: rows[w.id]?.newHire ?? 0,
    }));
    const immune_placements = immuneMembers.map((m) => ({
      associate_id: m.id,
      workstation_id: immunePlacements[m.id]?.workstationId ?? "",
      dates: immunePlacements[m.id]?.dates ?? [],
    }));

    startTransition(async () => {
      // Wrapped in try/catch: an unparseable response (e.g. a raw crash
      // page instead of JSON) or a network failure would otherwise throw
      // inside this async callback with nothing to catch it — the button
      // would just silently do nothing, no error shown, no schedule
      // created, indistinguishable from the request never having been
      // sent at all.
      try {
        const res = await fetch("/api/schedule/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week_start_date: weekStart, quotas, immune_placements }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? `Couldn't generate the schedule (server responded ${res.status}).`);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? `Couldn't reach the server: ${err.message}` : "Couldn't reach the server.");
      }
    });
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setWeekStart(defaultWeekStart);
          // Same reasoning as handleWeekChange: a previous session's
          // checked days are calendar dates for whatever week that was,
          // which may not be this one — start clean rather than carry
          // over stale dates the next Generate submission would silently
          // fail on.
          setImmunePlacements((prev) => Object.fromEntries(Object.entries(prev).map(([id, p]) => [id, { ...p, dates: [] }])));
          setOpen(true);
        }}
      >
        Generate schedule
      </Button>

      {open && createPortal(
        // Portaled to document.body instead of rendering in place: this
        // button now lives inside PageHeader's action slot, whose <header>
        // has backdrop-blur (a backdrop-filter) — that creates a new
        // containing block for `position: fixed` descendants, so without
        // the portal this modal would be clipped/positioned relative to
        // that skinny header bar instead of the viewport.
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-4xl max-h-[96vh] bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg flex flex-col animate-scale-in overflow-hidden"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky so the title/subtitle stay in view while the long
                form below scrolls underneath — the modal itself no longer
                scrolls as a whole, only this inner body does. */}
            <div className="shrink-0 sticky top-0 z-10 bg-[var(--paper-raised)] border-b border-[var(--line)] px-5 pt-5 pb-3">
              <h2 className="font-serif text-xl text-[var(--ink)] m-0 mb-1">Plan coverage — {formatWeekRange(weekStart)}</h2>
              <p className="text-sm text-[var(--muted)] m-0">
                Generates a fresh, independent shuffle for each work day (Mon–Fri) — the same station can (and
                usually will) have a different person each day. Headcount per station is fixed (set on Workstations)
                — Tenured/New Hire are pre-filled per your usual split, adjust as needed; that same split applies to
                every day. OIC is included and eligible for seating too. Required Tenured per station is filled
                first; any station seats still open after that (including New Hire targets short on New Hires) get
                filled by whoever&apos;s left over, tenured or not — every station&apos;s fixed headcount takes
                priority over an exact tenure-label match.
              </p>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-3 px-5 py-4">
            <div>
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">Week</label>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="text-sm border border-[var(--line)] rounded px-2.5 py-1.5 bg-[var(--paper)]"
              />
              <p className="text-[11px] text-[var(--muted)] mt-1 m-0">
                Defaults to the next open week — pick any date and it snaps to that week&apos;s Monday. Generating fails
                with a clear error if that week already has a schedule.
              </p>
            </div>

            {immuneMembers.length > 0 && (
              <div>
                <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Immune members — place them first (required)
                </h3>
                <div className="flex flex-col gap-2">
                  {immuneMembers.map((m) => {
                    const placement = immunePlacements[m.id];
                    return (
                      <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 border border-[var(--line)] rounded-md px-2.5 py-2">
                        <span className="text-sm flex-1 truncate min-w-[120px]">{m.name}</span>
                        <select
                          value={placement?.workstationId ?? ""}
                          onChange={(e) => updateImmuneStation(m.id, e.target.value)}
                          className="text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)] min-w-[150px]"
                        >
                          <option value="">Select a station…</option>
                          {workstations.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-1.5">
                          {workDates.map((date) => (
                            <label
                              key={date}
                              className="flex items-center gap-1 text-[11px] border border-[var(--line)] rounded px-1.5 py-0.5 cursor-pointer select-none bg-[var(--paper)]"
                            >
                              <input
                                type="checkbox"
                                checked={placement?.dates.includes(date) ?? false}
                                onChange={() => toggleImmuneDate(m.id, date)}
                                className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
                              />
                              {weekdayShortLabel(date)}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1.5 m-0">
                  No automatic carryover from last week — place immune members at a station and pick which day(s)
                  they&apos;re pinned there yourself, every time. On any day left unchecked, they join the normal
                  random shuffle just like everyone else.
                </p>
              </div>
            )}

            <div className="overflow-x-auto scroll-shadow-x">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-1.5 border-b border-[var(--line)]">Station</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-1.5 border-b border-[var(--line)]">Headcount</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-1.5 border-b border-[var(--line)]">Tenured</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wider text-[var(--muted)] font-semibold py-1.5 border-b border-[var(--line)]">New Hire</th>
                  </tr>
                </thead>
                <tbody>
                  {workstations.map((w) => {
                    const assigned = (rows[w.id]?.tenured ?? 0) + (rows[w.id]?.newHire ?? 0);
                    const overAssigned = assigned > w.headcount;
                    return (
                      <tr key={w.id}>
                        <td className="py-1.5 border-b border-[var(--line)]">{w.name}</td>
                        <td className="py-1.5 border-b border-[var(--line)]">
                          <Pill tone="accent">
                            {w.headcount} seat{w.headcount === 1 ? "" : "s"}
                          </Pill>
                          {overAssigned && <div className="text-[10px] text-[var(--bad)] font-bold mt-0.5">Exceeds fixed headcount</div>}
                        </td>
                        <td className="py-1.5 border-b border-[var(--line)]">
                          <input
                            type="number"
                            min={0}
                            value={rows[w.id]?.tenured ?? 0}
                            onChange={(e) => updateRow(w.id, "tenured", Number(e.target.value))}
                            className="w-16 text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
                          />
                        </td>
                        <td className="py-1.5 border-b border-[var(--line)]">
                          <input
                            type="number"
                            min={0}
                            value={rows[w.id]?.newHire ?? 0}
                            onChange={(e) => updateRow(w.id, "newHire", Number(e.target.value))}
                            className="w-16 text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-[var(--paper)] rounded-md p-2.5 border border-[var(--line)] text-[13px]">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-0.5">Fixed headcount</div>
                <div className={fixedHeadcount > totalMembers ? "text-[var(--bad)] font-bold" : "font-bold"}>
                  {fixedHeadcount} / {totalMembers}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-0.5">Tenured planned</div>
                <div className={totals.tenured > totalTenured ? "text-[var(--bad)] font-bold" : "font-bold"}>
                  {totals.tenured} / {totalTenured}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-0.5">New Hire planned</div>
                <div className={totals.newHire > totalNewHire ? "text-[var(--bad)] font-bold" : "font-bold"}>
                  {totals.newHire} / {totalNewHire}
                </div>
              </div>
            </div>

            {fixedHeadcount > totalMembers && (
              <p className="text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
                Fixed headcount across all stations ({fixedHeadcount}) is {fixedHeadcount - totalMembers} more than
                your total active headcount ({totalMembers}) — every day, {fixedHeadcount - totalMembers === 1 ? "one seat" : `${fixedHeadcount - totalMembers} seats`}{" "}
                somewhere will go unfilled, and it&apos;ll be a different station each time (whoever the random fill
                runs out of people for that day). Reduce a station&apos;s headcount on Workstations, or bring
                {fixedHeadcount - totalMembers === 1 ? " one more person" : " more people"} active, if every seat
                needs to be filled every day.
              </p>
            )}

            {unplacedImmune.length > 0 && (
              <p className="text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
                {unplacedImmune.length} immune member{unplacedImmune.length > 1 ? "s" : ""} still need a station and
                at least one day checked before you can generate.
              </p>
            )}

            {immuneOverflow.length > 0 && (
              <p className="text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
                Too many immune members at one station on the same day —{" "}
                {immuneOverflow
                  .map((o) => `${o.name} on ${weekdayShortLabel(o.date)}: ${o.placed} placed, only ${o.headcount} seat${o.headcount === 1 ? "" : "s"}`)
                  .join("; ")}
                . Move some to a different station/day, or increase that station&apos;s headcount on Workstations.
              </p>
            )}

            {error && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button style={{ padding: "7px 14px" }} disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px" }}
                disabled={pending || unplacedImmune.length > 0 || immuneOverflow.length > 0}
                onClick={generate}
              >
                {pending ? "Generating…" : "Generate"}
              </Button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

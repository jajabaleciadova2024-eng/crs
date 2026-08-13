"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui";

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
}: {
  workstations: Workstation[];
  totalMembers: number;
  totalTenured: number;
  totalNewHire: number;
  immuneMembers: ImmuneMember[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, QuotaRow>>(() =>
    Object.fromEntries(workstations.map((w) => [w.id, defaultQuotaRow(w)]))
  );
  const [immunePlacements, setImmunePlacements] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  const unplacedImmune = immuneMembers.filter((m) => !immunePlacements[m.id]);

  // Catches an over-full station BEFORE submitting, not just after the
  // server rejects it — if more immune members are pointed at one station
  // than it has seats for, some of them can't actually be honored there,
  // which the API refuses to silently paper over (see the route's own
  // validation). Surfacing it here means the Team Leader sees exactly
  // which station and who, immediately, instead of a round-trip error.
  const immuneOverflow = useMemo(() => {
    const countByStation = new Map<string, number>();
    for (const m of immuneMembers) {
      const stationId = immunePlacements[m.id];
      if (!stationId) continue;
      countByStation.set(stationId, (countByStation.get(stationId) ?? 0) + 1);
    }
    return workstations
      .filter((w) => (countByStation.get(w.id) ?? 0) > w.headcount)
      .map((w) => ({ name: w.name, placed: countByStation.get(w.id) ?? 0, headcount: w.headcount }));
  }, [immuneMembers, immunePlacements, workstations]);

  function updateRow(id: string, field: keyof QuotaRow, value: number) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: Math.max(0, value) } }));
  }

  function generate() {
    setError(null);
    if (unplacedImmune.length > 0) {
      setError(`Place every immune member at a station first — still missing: ${unplacedImmune.map((m) => m.name).join(", ")}`);
      return;
    }
    if (immuneOverflow.length > 0) {
      setError(
        `Too many immune members placed at the same station: ${immuneOverflow
          .map((o) => `${o.name} (${o.placed} placed, only ${o.headcount} seat${o.headcount === 1 ? "" : "s"})`)
          .join("; ")}. Move some to a different station, or increase that station's headcount on Workstations.`
      );
      return;
    }

    const quotas = workstations.map((w) => ({
      workstation_id: w.id,
      headcount: w.headcount,
      tenured: rows[w.id]?.tenured ?? 0,
      newHire: rows[w.id]?.newHire ?? 0,
    }));
    const immune_placements = immuneMembers.map((m) => ({ associate_id: m.id, workstation_id: immunePlacements[m.id] }));

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
          body: JSON.stringify({ quotas, immune_placements }),
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
      <Button variant="primary" onClick={() => setOpen(true)}>
        Generate next week
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-4xl max-h-[96vh] overflow-y-auto bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-5 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif text-xl text-[var(--ink)] m-0 mb-1">Plan next week&apos;s coverage</h2>
              <p className="text-sm text-[var(--muted)] m-0">
                Headcount per station is fixed (set on Workstations) — Tenured/New Hire are pre-filled per your usual
                split, adjust as needed. OIC is included and eligible for seating too. Required Tenured per station is
                filled first; any station seats still open after that (including New Hire targets short on New Hires)
                get filled by whoever&apos;s left over, tenured or not — every station&apos;s fixed headcount takes
                priority over an exact tenure-label match.
              </p>
            </div>

            {immuneMembers.length > 0 && (
              <div>
                <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Immune members — place them first (required)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {immuneMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="text-sm flex-1 truncate">{m.name}</span>
                      <select
                        value={immunePlacements[m.id] ?? ""}
                        onChange={(e) => setImmunePlacements((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        className="text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)] min-w-[150px]"
                      >
                        <option value="">Select a station…</option>
                        {workstations.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1.5 m-0">
                  No automatic carryover from last week — place immune members at a station yourself every time.
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

            {unplacedImmune.length > 0 && (
              <p className="text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
                {unplacedImmune.length} immune member{unplacedImmune.length > 1 ? "s" : ""} still need a station before
                you can generate.
              </p>
            )}

            {immuneOverflow.length > 0 && (
              <p className="text-sm text-[var(--warn)] bg-[var(--warn-soft)] rounded px-3 py-2 m-0">
                Too many immune members at one station —{" "}
                {immuneOverflow.map((o) => `${o.name}: ${o.placed} placed, only ${o.headcount} seat${o.headcount === 1 ? "" : "s"}`).join("; ")}.
                Move some to a different station, or increase that station&apos;s headcount on Workstations.
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
      )}
    </>
  );
}

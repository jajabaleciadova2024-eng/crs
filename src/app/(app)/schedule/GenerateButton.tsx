"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Workstation = { id: string; name: string };
type ImmuneMember = { id: string; name: string };
type QuotaRow = { headcount: number; tenured: number; newHire: number };

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
    Object.fromEntries(workstations.map((w) => [w.id, { headcount: 1, tenured: 0, newHire: 0 }]))
  );
  const [immunePlacements, setImmunePlacements] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const totals = useMemo(() => {
    let headcount = 0;
    let tenured = 0;
    let newHire = 0;
    for (const r of Object.values(rows)) {
      headcount += r.headcount;
      tenured += r.tenured;
      newHire += r.newHire;
    }
    return { headcount, tenured, newHire };
  }, [rows]);

  const unplacedImmune = immuneMembers.filter((m) => !immunePlacements[m.id]);

  function updateRow(id: string, field: keyof QuotaRow, value: number) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: Math.max(0, value) } }));
  }

  function generate() {
    setError(null);
    if (unplacedImmune.length > 0) {
      setError(`Place every immune member at a station first — still missing: ${unplacedImmune.map((m) => m.name).join(", ")}`);
      return;
    }

    const quotas = workstations.map((w) => ({
      workstation_id: w.id,
      headcount: rows[w.id]?.headcount ?? 1,
      tenured: rows[w.id]?.tenured ?? 0,
      newHire: rows[w.id]?.newHire ?? 0,
    }));
    const immune_placements = immuneMembers.map((m) => ({ associate_id: m.id, workstation_id: immunePlacements[m.id] }));

    startTransition(async () => {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotas, immune_placements }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't generate the schedule.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Generate next week
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[var(--paper-raised)] border border-[var(--line)] rounded-md p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif text-xl text-[var(--ink)] m-0 mb-1">Plan next week&apos;s coverage</h2>
              <p className="text-sm text-[var(--muted)] m-0">
                Set how many associates each station needs, and how many of those should be Tenured vs. New Hire.
                OIC is included and eligible for seating too.
              </p>
            </div>

            {immuneMembers.length > 0 && (
              <div>
                <h3 className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-2">
                  Immune members — place them first (required)
                </h3>
                <div className="flex flex-col gap-2">
                  {immuneMembers.map((m) => (
                    <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                      <span className="text-sm flex-1">{m.name}</span>
                      <select
                        value={immunePlacements[m.id] ?? ""}
                        onChange={(e) => setImmunePlacements((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        className="text-xs border border-[var(--line)] rounded px-2 py-1.5 bg-[var(--paper)] w-full sm:w-auto sm:min-w-[180px]"
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
                <p className="text-xs text-[var(--muted)] mt-2 m-0">
                  No automatic carryover from last week anymore — you place immune members at a station yourself every
                  time before generating.
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">Station</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">Headcount</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">Tenured</th>
                    <th className="text-left text-[10.5px] uppercase tracking-wide text-[var(--muted)] font-semibold py-2 border-b border-[var(--line)]">New Hire</th>
                  </tr>
                </thead>
                <tbody>
                  {workstations.map((w) => (
                    <tr key={w.id}>
                      <td className="py-2 border-b border-[var(--line)]">{w.name}</td>
                      <td className="py-2 border-b border-[var(--line)]">
                        <input
                          type="number"
                          min={0}
                          value={rows[w.id]?.headcount ?? 0}
                          onChange={(e) => updateRow(w.id, "headcount", Number(e.target.value))}
                          className="w-16 text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
                        />
                      </td>
                      <td className="py-2 border-b border-[var(--line)]">
                        <input
                          type="number"
                          min={0}
                          value={rows[w.id]?.tenured ?? 0}
                          onChange={(e) => updateRow(w.id, "tenured", Number(e.target.value))}
                          className="w-16 text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
                        />
                      </td>
                      <td className="py-2 border-b border-[var(--line)]">
                        <input
                          type="number"
                          min={0}
                          value={rows[w.id]?.newHire ?? 0}
                          onChange={(e) => updateRow(w.id, "newHire", Number(e.target.value))}
                          className="w-16 text-xs border border-[var(--line)] rounded px-2 py-1 bg-[var(--paper)]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-[var(--paper)] rounded-md p-3 border border-[var(--line)] text-[13px]">
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted)] mb-0.5">Headcount planned</div>
                <div className={totals.headcount > totalMembers ? "text-[var(--bad)] font-bold" : "font-bold"}>
                  {totals.headcount} / {totalMembers}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted)] mb-0.5">Tenured planned</div>
                <div className={totals.tenured > totalTenured ? "text-[var(--bad)] font-bold" : "font-bold"}>
                  {totals.tenured} / {totalTenured}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--muted)] mb-0.5">New Hire planned</div>
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

            {error && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button style={{ padding: "7px 14px" }} disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px" }}
                disabled={pending || unplacedImmune.length > 0}
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { formatFullName } from "@/lib/format";
import type { Profile } from "@/lib/database.types";

export default function ReassignForm({
  assignmentId,
  workstationName,
  associates,
  currentAssociateId,
  stationByAssociate,
}: {
  assignmentId: string;
  workstationName: string;
  associates: Pick<Profile, "id" | "first_name" | "last_name">[];
  currentAssociateId: string;
  // Who's already seated where this week (associate id -> station name) —
  // picking someone who's already on this map (at a different station)
  // swaps the two instead of a plain reassignment; shown in the dropdown
  // so that's not a surprise.
  stationByAssociate?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentAssociateId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    // Icon-only trigger — the grid now has one of these per assigned
    // person per day, and a full "Reassign" text button in every cell
    // got noisy fast (see the daily-rotation grid in schedule/page.tsx).
    // Two arrows cycling into each other reads as "swap" at a glance.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reassign ${workstationName}`}
        title="Reassign"
        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
    );
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/schedule/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignment_id: assignmentId, associate_id: selected }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? `Couldn't reassign that station (server responded ${res.status}).`);
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
    // w-full: this renders inline inside a flex-wrap chip alongside the
    // person's name (see schedule/page.tsx) — forcing full width makes it
    // wrap onto its own line under the name instead of getting squeezed
    // into whatever space happens to be left over.
    <div className="flex flex-col items-start gap-1 w-full">
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="text-xs border border-[var(--line)] rounded px-1.5 py-1 bg-[var(--paper)]"
          aria-label={`Reassign ${workstationName}`}
        >
          <option value="">— Unassigned —</option>
          {associates.map((a) => {
            const elsewhere = a.id !== currentAssociateId ? stationByAssociate?.[a.id] : undefined;
            return (
              <option key={a.id} value={a.id}>
                {formatFullName(a.first_name, a.last_name)}
                {elsewhere ? ` — swap with ${elsewhere}` : ""}
              </option>
            );
          })}
        </select>
        <Button variant="primary" onClick={handleSave} disabled={pending} style={{ padding: "5px 10px" }}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button onClick={() => setOpen(false)} disabled={pending} style={{ padding: "5px 10px" }}>
          Cancel
        </Button>
      </div>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}

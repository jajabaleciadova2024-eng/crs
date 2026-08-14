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
    return (
      <Button onClick={() => setOpen(true)} style={{ padding: "5px 10px" }}>
        Reassign
      </Button>
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
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
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

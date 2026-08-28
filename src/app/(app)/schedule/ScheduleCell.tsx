"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/database.types";
import AssignmentCard from "./AssignmentCard";

type DragPayload = { assignmentId: string; associateId: string; workstationId: string; date: string };
type CellEntry = { assignmentId: string; associateId: string; name: string; windowLabel?: string | null; isImmune: boolean; onLeave: boolean };

// One (station, day) cell in the schedule grid. Renders its people as
// draggable AssignmentCards, and is itself a drop target for "move this
// person into an OPEN seat here" — dropping directly onto another card is a
// swap instead, handled by that card (see AssignmentCard.tsx); this only
// fires when the drop lands on the cell's empty space, since the card's own
// drop handler stops the event from bubbling up here.
export default function ScheduleCell({
  workstationId,
  workstationName,
  date,
  entries,
  headcount,
  canManage,
  associates,
  stationByAssociate,
}: {
  workstationId: string;
  workstationName: string;
  date: string;
  entries: CellEntry[];
  // Fixed seats for this station — when there are fewer entries than this,
  // the remainder render as dashed "Open seat" placeholders so a manpower
  // shortfall (see the Generate modal's headcount-vs-active warning) is
  // visible right where it landed, not just a shorter list of cards.
  headcount?: number;
  canManage: boolean;
  associates: Pick<Profile, "id" | "first_name" | "last_name">[];
  stationByAssociate?: Record<string, string>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function readPayload(e: React.DragEvent): DragPayload | null {
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return null;
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (!canManage) return;
    const dragged = readPayload(e);
    if (dragged && (dragged.date !== date || dragged.workstationId === workstationId)) return;
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    if (!canManage) return;
    e.preventDefault();
    setDragOver(false);
    const dragged = readPayload(e);
    if (!dragged || dragged.date !== date || dragged.workstationId === workstationId) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/schedule/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignment_id: dragged.assignmentId, workstation_id: workstationId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Couldn't move that assignment.");
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't reach the server.");
      }
    });
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col gap-1.5 min-h-[34px] rounded-md transition-colors ${dragOver ? "bg-[var(--accent-soft)]/40 ring-2 ring-[var(--accent)] ring-inset" : ""}`}
    >
      {entries.length === 0 && !headcount ? <span className="text-[var(--muted)]">—</span> : null}
      {entries.map((entry) => (
        <AssignmentCard
          key={entry.assignmentId}
          assignmentId={entry.assignmentId}
          associateId={entry.associateId}
          name={entry.name}
          windowLabel={entry.windowLabel}
          isImmune={entry.isImmune}
          onLeave={entry.onLeave}
          canManage={canManage}
          workstationId={workstationId}
          workstationName={workstationName}
          date={date}
          associates={associates}
          stationByAssociate={stationByAssociate}
        />
      ))}
      {headcount != null &&
        Array.from({ length: Math.max(headcount - entries.length, 0) }).map((_, i) => (
          <div
            key={`open-${i}`}
            className="rounded-md border border-dashed border-[var(--line)] px-2 py-1.5 text-[11px] text-[var(--muted)] text-center"
          >
            Open seat
          </div>
        ))}
      {error && <span className="text-[10.5px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}

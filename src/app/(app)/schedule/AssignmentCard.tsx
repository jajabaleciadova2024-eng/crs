"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/database.types";
import ReassignForm from "./ReassignForm";

// The payload carried in the HTML5 drag — just enough for the drop target
// (another card, or the empty part of a different station's cell) to know
// who's being moved and where they're coming from.
type DragPayload = { assignmentId: string; associateId: string; workstationId: string; date: string };

export default function AssignmentCard({
  assignmentId,
  associateId,
  name,
  isImmune,
  onLeave,
  canManage,
  workstationId,
  workstationName,
  date,
  associates,
  stationByAssociate,
}: {
  assignmentId: string;
  associateId: string;
  name: string;
  isImmune: boolean;
  onLeave: boolean;
  canManage: boolean;
  workstationId: string;
  workstationName: string;
  date: string;
  associates: Pick<Profile, "id" | "first_name" | "last_name">[];
  stationByAssociate?: Record<string, string>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDragStart(e: React.DragEvent) {
    const payload: DragPayload = { assignmentId, associateId, workstationId, date };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }

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
    const dragged = readPayload(e);
    // Only same-day drops are ever valid (see the move endpoint's own
    // comment) — don't even show this card as a drop target otherwise, so
    // the browser's own "not allowed" cursor communicates it up front
    // instead of the drop silently doing nothing.
    if (dragged && dragged.date !== date) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  // Dropping one card directly ONTO another is a SWAP — both people trade
  // stations for that day. Goes through the existing /api/schedule/reassign
  // endpoint (its collision-handling already swaps two rows when the
  // incoming associate already holds a different station that same day,
  // which is always true here since they're mid-drag from their own card).
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation(); // don't also trigger the cell's own "move into empty seat" drop
    setDragOver(false);
    const dragged = readPayload(e);
    if (!dragged || dragged.date !== date || dragged.assignmentId === assignmentId) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/schedule/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignment_id: assignmentId, associate_id: dragged.associateId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Couldn't swap those two.");
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
      draggable={canManage}
      onDragStart={canManage ? handleDragStart : undefined}
      onDragOver={canManage ? handleDragOver : undefined}
      onDragLeave={canManage ? handleDragLeave : undefined}
      onDrop={canManage ? handleDrop : undefined}
      className={`flex items-center flex-wrap gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
        dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]/50" : "border-[var(--line)] bg-[var(--paper)]"
      } ${canManage ? "cursor-grab active:cursor-grabbing" : ""} ${pending ? "opacity-50" : ""}`}
    >
      <div className="min-w-0 flex-1">
        {/* Status as a small colored dot inline with the name, not a
            separate pill row below it — keeps every card the same height
            regardless of who's immune/on leave (see the mixed-height rows
            this used to cause), and stays visible on touch devices (no
            hover there). On a device that actually supports hover
            (desktop), each dot also reveals a small floating label on
            hover — Tailwind's hover/group-hover variants already compile
            to `@media (hover: hover)`, so this never triggers via a touch
            tap, only a real mouse hover. Absolutely positioned so it never
            affects the card's own layout/height. */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] sm:text-[12.5px] font-medium text-[var(--ink)] truncate">{name}</span>
          {canManage && isImmune && (
            <span className="group/dot relative inline-flex shrink-0">
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-[var(--accent)]" aria-label="Immune" />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 opacity-0 group-hover/dot:opacity-100 transition-opacity duration-150 whitespace-nowrap rounded bg-[var(--ink)] text-[var(--paper)] text-[10px] font-bold px-1.5 py-0.5 z-20">
                Immune
              </span>
            </span>
          )}
          {onLeave && (
            <span className="group/dot relative inline-flex shrink-0">
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-[var(--bad)]" aria-label="On leave" />
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 opacity-0 group-hover/dot:opacity-100 transition-opacity duration-150 whitespace-nowrap rounded bg-[var(--ink)] text-[var(--paper)] text-[10px] font-bold px-1.5 py-0.5 z-20">
                On leave
              </span>
            </span>
          )}
        </div>
        {error && <div className="text-[10px] text-[var(--bad)] mt-1">{error}</div>}
      </div>
      {canManage && (
        <ReassignForm
          assignmentId={assignmentId}
          workstationName={workstationName}
          associates={associates}
          currentAssociateId={associateId}
          stationByAssociate={stationByAssociate}
        />
      )}
    </div>
  );
}

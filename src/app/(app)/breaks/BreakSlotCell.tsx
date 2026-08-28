"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill } from "@/components/ui";
import { BREAK_SLOTS, BREAK_SLOT_LABEL, type BreakSlot } from "@/lib/breakTime";

type Entry = {
  id: string;
  windowLabel: string;
  workstationId: string;
  stationName: string;
  associateId: string;
  name: string;
  relieverId: string | null;
  onLeave: boolean;
  isMine: boolean;
};

// One break slot's list of windows. The Team Leader can move a window to a
// different slot inline — same idea as reassigning on the Weekly Schedule.
export default function BreakSlotCell({
  slot,
  date,
  entries,
  canManage,
}: {
  slot: BreakSlot;
  date: string;
  entries: Entry[];
  canManage: boolean;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function moveTo(entryId: string, next: BreakSlot) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("break_assignments").update({ break_slot: next }).eq("id", entryId);
      setMoving(null);
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return <p className="text-[12.5px] text-[var(--muted)] m-0 py-2">Nobody on break this slot.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((e) => (
        <div
          key={e.id}
          className={`rounded-md border px-2.5 py-2 transition-colors ${
            e.isMine
              ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
              : "border-[var(--line)] bg-[var(--paper-raised)]"
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded border border-[var(--line)] bg-[var(--paper)] px-1 text-[10px] font-bold tabular-nums text-[var(--muted)]">
              W{e.windowLabel}
            </span>
            <span className="text-[12.5px] font-medium text-[var(--ink)] truncate">{e.name}</span>
            {e.isMine && <Pill tone="accent">You</Pill>}
            {e.onLeave && <Pill tone="bad">On leave</Pill>}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-[11px] text-[var(--muted)]">
              {e.stationName}
              {e.relieverId && " · relieved"}
            </span>
            {canManage && (
              moving === e.id ? (
                <span className="flex items-center gap-1">
                  {BREAK_SLOTS.filter((s) => s !== slot).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={pending}
                      onClick={() => moveTo(e.id, s)}
                      className="px-1.5 py-0.5 rounded text-[10.5px] font-bold border border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {BREAK_SLOT_LABEL[s]}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMoving(null)}
                    className="px-1.5 py-0.5 rounded text-[10.5px] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setMoving(e.id)}
                  title="Move to another slot"
                  className="text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--accent-strong)] transition-colors cursor-pointer"
                >
                  Move →
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

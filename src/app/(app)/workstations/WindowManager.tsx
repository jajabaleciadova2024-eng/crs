"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pill, Button } from "@/components/ui";
import type { WorkstationWindow } from "@/lib/database.types";
import { sortWindows } from "@/lib/windowOrder";

// Windows are the physical service counters a station occupies — CO is
// windows 10/11/12/13, not "four seats". Managed inline per station row.
export default function WindowManager({
  workstationId,
  windows,
}: {
  workstationId: string;
  windows: WorkstationWindow[];
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const sorted = sortWindows(windows);

  function addWindow() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: insertError } = await supabase
        .from("workstation_windows")
        .insert({ workstation_id: workstationId, label: trimmed });
      if (insertError) {
        // The unique index is on lower(label) across every station, since a
        // physical window exists once on the floor.
        setError(
          insertError.message.includes("duplicate") || insertError.code === "23505"
            ? `Window ${trimmed} already exists on another station.`
            : insertError.message,
        );
        return;
      }
      setLabel("");
      setAdding(false);
      router.refresh();
    });
  }

  function toggleWindow(w: WorkstationWindow) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("workstation_windows").update({ is_active: !w.is_active }).eq("id", w.id);
      router.refresh();
    });
  }

  function removeWindow(w: WorkstationWindow) {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("workstation_windows").delete().eq("id", w.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 max-w-[220px] sm:max-w-none">
        {sorted.length === 0 && !adding && (
          <span className="text-[var(--muted)] text-[12px]">No windows set</span>
        )}
        {sorted.map((w) => (
          <span
            key={w.id}
            className={`group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums transition-colors ${
              w.is_active
                ? "border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)]"
                : "border-dashed border-[var(--line)] text-[var(--muted)] line-through"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleWindow(w)}
              disabled={pending}
              title={w.is_active ? `Window ${w.label} — click to mark closed` : `Window ${w.label} is closed — click to reopen`}
              className="cursor-pointer disabled:opacity-50"
            >
              {w.label}
            </button>
            <button
              type="button"
              onClick={() => removeWindow(w)}
              disabled={pending}
              title={`Remove window ${w.label}`}
              aria-label={`Remove window ${w.label}`}
              className="text-[var(--muted)] hover:text-[var(--bad)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addWindow();
                if (e.key === "Escape") { setAdding(false); setLabel(""); setError(null); }
              }}
              placeholder="e.g. 27"
              className="w-20 text-[12px] border border-[var(--line)] rounded px-1.5 py-0.5 bg-[var(--paper)]"
            />
            <Button type="button" variant="primary" style={{ padding: "3px 8px" }} disabled={pending} onClick={addWindow}>
              Add
            </Button>
            <Button type="button" style={{ padding: "3px 8px" }} onClick={() => { setAdding(false); setLabel(""); setError(null); }}>
              Cancel
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--line)] px-1.5 py-0.5 text-[11.5px] text-[var(--muted)] hover:text-[var(--accent-strong)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            + Window
          </button>
        )}
      </div>
      {error && <span className="text-[11px] text-[var(--bad)]">{error}</span>}
    </div>
  );
}

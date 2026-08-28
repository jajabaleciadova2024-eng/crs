import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareWindowLabels } from "@/lib/windowOrder";

// Keeping assignments, windows and breaks consistent after a manual edit.
//
// An assignment names a specific window, and a break row names the person
// sitting at that window. Moving or swapping people therefore has to move the
// window and the break with them, or the schedule starts telling lies — a
// person moved from Collecting Officer to Releasing Officer would keep showing
// a CO window number, and their break would still be filed under whoever used
// to sit there.

/**
 * A free window at `workstationId` on `date` — one not already taken by
 * another assignment that day. Returns null when the station has no window
 * to spare (more people than windows), which is a valid state: the person is
 * seated, just not at a numbered window.
 */
export async function pickFreeWindow(
  supabase: SupabaseClient,
  workstationId: string,
  scheduleWeekId: string,
  date: string,
  excludeAssignmentId?: string,
): Promise<string | null> {
  const [{ data: windows }, { data: taken }] = await Promise.all([
    supabase.from("workstation_windows").select("id, label").eq("workstation_id", workstationId).eq("is_active", true),
    supabase
      .from("assignments")
      .select("id, window_id")
      .eq("schedule_week_id", scheduleWeekId)
      .eq("assignment_date", date)
      .eq("workstation_id", workstationId),
  ]);

  const takenIds = new Set(
    (taken ?? [])
      .filter((a: { id: string }) => a.id !== excludeAssignmentId)
      .map((a: { window_id: string | null }) => a.window_id)
      .filter(Boolean),
  );

  const free = [...(windows ?? [])]
    .sort((a, b) => compareWindowLabels(a.label, b.label))
    .find((w) => !takenIds.has(w.id));

  return free?.id ?? null;
}

/**
 * Point the break row for (date, window) at whoever now sits there. Breaks
 * belong to the WINDOW — the slot doesn't change when the person does, only
 * who is taking it.
 */
export async function syncBreakOccupant(
  supabase: SupabaseClient,
  date: string,
  windowId: string | null,
  associateId: string,
): Promise<void> {
  if (!windowId) return;
  const { error } = await supabase
    .from("break_assignments")
    .update({ associate_id: associateId })
    .eq("assignment_date", date)
    .eq("window_id", windowId);
  // Never fatal: a week generated before breaks existed simply has no row.
  if (error) console.error("[windowSync] couldn't resync break occupant:", error);
}

/**
 * Drop the break row for a window nobody sits at any more — otherwise the
 * break schedule keeps listing a person who has been moved away.
 */
export async function clearBreakForWindow(
  supabase: SupabaseClient,
  date: string,
  windowId: string | null,
): Promise<void> {
  if (!windowId) return;
  const { error } = await supabase
    .from("break_assignments")
    .delete()
    .eq("assignment_date", date)
    .eq("window_id", windowId);
  if (error) console.error("[windowSync] couldn't clear break for window:", error);
}

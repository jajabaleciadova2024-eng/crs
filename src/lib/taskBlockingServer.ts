import { createAdminClient } from "@/lib/supabase/admin";
import { taskAppliesTo } from "@/lib/taskAssignment";
import { isTaskBlockingToday } from "@/lib/taskBlocking";

// How many assigned tasks are actively blocking `profileId` right now.
//
// Goes through the admin client on purpose: member_tasks and
// member_task_completions are not readable row-for-row by a plain associate
// under RLS, and the caller here is always acting on that member's own
// behalf. Only the three columns needed for the blocking decision are read.
//
// Mirrors the Dashboard/Weekly Schedule rule exactly — a task blocks unless
// it has an APPROVED completion (submitted-but-pending and rejected both
// still block), and only while it is active today.
export async function countBlockingTasks(profileId: string): Promise<number> {
  const admin = createAdminClient();
  const [{ data: tasks }, { data: completions }] = await Promise.all([
    admin
      .from("member_tasks")
      .select("id, deadline, blocker_days_before, assign_to, excluded_ids")
      .or(`assign_to.eq.all,assign_to.eq.${profileId}`),
    admin.from("member_task_completions").select("task_id, status").eq("profile_id", profileId),
  ]);

  const approvedIds = new Set(
    (completions ?? [])
      .filter((c: { status: string }) => c.status === "approved")
      .map((c: { task_id: string }) => c.task_id),
  );

  // The .or() above matches on assign_to alone; the exemption list has to
  // be applied here, or an excused member stays blocked by the task.
  return (tasks ?? []).filter(
    (t: { id: string; deadline: string | null; blocker_days_before: number; assign_to: string; excluded_ids: string[] | null }) =>
      taskAppliesTo(t, profileId) && !approvedIds.has(t.id) && isTaskBlockingToday(t),
  ).length;
}

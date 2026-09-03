// The Supabase client is deliberately untyped (see src/lib/supabase/client.ts),
// so joined-column access below is cast through `any` on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireProfile, canManageOperations } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel, PageHeader } from "@/components/ui";
import Link from "next/link";
import TaskList from "./TaskList";

export default async function TasksPage() {
  const profile = await requireProfile();
  const canManage = canManageOperations(profile.role);
  const admin = createAdminClient();

  // Fetch tasks, completions, and members in parallel.
  //
  // member_task_completions has TWO foreign keys to profiles — profile_id
  // (who did the task) and reviewed_by (who approved it, added in 0024) — so
  // the embed below MUST name which one. A bare `profiles(...)` is ambiguous:
  // PostgREST refuses it, the whole query returns null, and the Team Leader
  // silently sees no submissions at all. Same trap that once emptied the
  // leave queue; see leave/page.tsx.
  const [{ data: tasks }, { data: myCompletions }, { data: allCompletions, error: completionsError }, { data: members }] =
    await Promise.all([
      admin
        .from("member_tasks")
        .select("*, profiles!member_tasks_created_by_fkey(first_name, last_name)")
        .order("created_at", { ascending: false }),
      admin
        .from("member_task_completions")
        .select("task_id, status, review_note")
        .eq("profile_id", profile.id),
      canManage
        ? admin
            .from("member_task_completions")
            .select("id, task_id, profile_id, status, completed_at, completion_date, photo_path, review_note, profiles!member_task_completions_profile_id_fkey(first_name, last_name)")
            .order("completed_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      canManage
        ? admin.from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name")
        : admin.from("profiles").select("id, first_name, last_name").eq("is_active", true).order("first_name"),
    ]);

  // Surface it rather than rendering an empty list as if nobody had
  // submitted — an embed that stops resolving is invisible otherwise.
  if (completionsError) console.error("[tasks] completions query failed:", completionsError);

  // Only approved completions count as truly done
  const approvedIds = new Set(
    (myCompletions ?? [])
      .filter((c: { status: string }) => c.status === "approved")
      .map((c: { task_id: string }) => c.task_id),
  );
  // Per-task status map
  const myStatusMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; status: string }) => [c.task_id, c.status]),
  );
  // The decline reason for THIS viewer's own submission, shown back on their
  // card the way a rejected leave request shows its review_note.
  const myNoteMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; review_note: string | null }) => [c.task_id, c.review_note]),
  );

  // Filter tasks: associates/OIC only see tasks assigned to 'all' or to them
  const filtered = (tasks ?? []).filter(
    (t: { assign_to: string }) => canManage || t.assign_to === "all" || t.assign_to === profile.id,
  );

  const enriched = filtered.map((t: any) => ({
    ...t,
    completionStatus: (myStatusMap.get(t.id) as string | undefined) ?? "none",
    myReviewNote: (myNoteMap.get(t.id) as string | null | undefined) ?? null,
    completions: canManage
      ? (allCompletions ?? []).filter((c: any) => c.task_id === t.id)
      : undefined,
  }));

  return (
    <>
      <PageHeader
        title="Members Tasks"
        subtitle="Required tasks that must be completed — pending tasks block viewing future schedules"
        action={
          canManage ? (
            <Link href="/tasks/report" className="text-xs font-bold text-[var(--accent-strong)]">
              Full report →
            </Link>
          ) : undefined
        }
      />

      <Panel
        title="Tasks"
        hint={canManage ? "Team Leader" : undefined}
        footnote={
          canManage
            ? "Add tasks for all members or specific individuals. Tasks with a deadline will block schedule viewing X days before the deadline. Tasks without a deadline block immediately until completed. You must approve completed tasks before they unlock schedules."
            : "Complete all pending tasks to unlock access to your upcoming schedule. Your Team Leader must approve completions."
        }
      >
        <TaskList
          tasks={enriched}
          canManage={canManage}
          members={members ?? []}
        />
      </Panel>
    </>
  );
}

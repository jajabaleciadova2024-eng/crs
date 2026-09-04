import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageOperations } from "@/lib/auth";
import { taskAppliesTo } from "@/lib/taskAssignment";
import { taskExportFile, type ExportPerson } from "@/lib/taskExport";

// CSV for ONE task — never a combined file.
//
// This is a compliance return: one sheet per course, with the course title
// and its due date in the two rows above the table. A single file covering
// several tasks would have to drop those rows or repeat them mid-sheet, and
// neither is a document anybody can hand over. So the task id is in the path
// and there is no "export all" route to reach.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !canManageOperations(profile.role)) {
    return new Response("Only the Team Leader can export a task.", { status: 403 });
  }

  const [{ data: task }, { data: members }, { data: completions }] = await Promise.all([
    admin
      .from("member_tasks")
      .select("id, title, deadline, assign_to, excluded_ids")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, psid, first_name, last_name")
      .eq("is_active", true)
      .neq("role", "team_leader")
      .order("first_name"),
    admin
      .from("member_task_completions")
      .select("profile_id, status, completion_date, completed_at, photo_path")
      .eq("task_id", id),
  ]);

  if (!task) return new Response("Task not found.", { status: 404 });

  type Completion = {
    profile_id: string;
    status: string;
    completion_date: string | null;
    completed_at: string | null;
    photo_path: string | null;
  };
  const completionFor = new Map(
    ((completions ?? []) as Completion[]).map((c) => [c.profile_id, c]),
  );

  type Person = { id: string; psid: string | null; first_name: string; last_name: string };
  // Everyone the task is for, plus anyone who submitted against it and has
  // since left the roster — the same rule the report screen uses, so the
  // sheet and the screen can never disagree about who was on the hook.
  const roster = ((members ?? []) as Person[]).filter((m) => taskAppliesTo(task, m.id));
  const rosterIds = new Set(roster.map((m) => m.id));
  const strayIds = [...completionFor.keys()].filter((pid) => !rosterIds.has(pid));
  const { data: strays } = strayIds.length
    ? await admin.from("profiles").select("id, psid, first_name, last_name").in("id", strayIds)
    : { data: [] };

  const people: ExportPerson[] = [...roster, ...((strays ?? []) as Person[])].map((m) => {
    const c = completionFor.get(m.id);
    return {
      psid: m.psid,
      first_name: m.first_name,
      last_name: m.last_name,
      status: c?.status ?? null,
      completion_date: c?.completion_date ?? null,
      completed_at: c?.completed_at ?? null,
      has_proof: !!c?.photo_path,
    };
  });

  const { body, filename } = taskExportFile(task, people);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

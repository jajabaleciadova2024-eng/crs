import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify, allActiveMemberIds } from "@/lib/bellNotify";
import { taskAppliesTo } from "@/lib/taskAssignment";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Fetch all tasks with creator info
  const { data: tasks, error } = await admin
    .from("member_tasks")
    .select("*, profiles!member_tasks_created_by_fkey(first_name, last_name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tasks] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch completions for the current user (with status)
  const { data: myCompletions } = await admin
    .from("member_task_completions")
    .select("task_id, status, review_note, photo_path")
    .eq("profile_id", user.id);

  // Only approved completions count as "done"
  const approvedIds = new Set(
    (myCompletions ?? []).filter((c: { status: string }) => c.status === "approved").map((c: { task_id: string }) => c.task_id),
  );
  // Build a status map for per-task completionStatus
  const myStatusMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; status: string }) => [c.task_id, c.status]),
  );
  // The Team Leader's reason for declining, surfaced back to the member on
  // their own card — same as a rejected leave request shows its review_note.
  const myNoteMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; review_note: string | null }) => [c.task_id, c.review_note]),
  );

  // Fetch all completions (for TL to see progress)
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let allCompletions: { id: string; task_id: string; profile_id: string; status: string; completed_at: string; profiles: { first_name: string; last_name: string } | null }[] = [];
  if (profile?.role === "team_leader") {
    const { data } = await admin
      .from("member_task_completions")
      .select("id, task_id, profile_id, status, completed_at, completion_date, photo_path, review_note, profiles!member_task_completions_profile_id_fkey(first_name, last_name)")
      .order("completed_at", { ascending: false });
    allCompletions = (data ?? []) as unknown as typeof allCompletions;
  }

  // Filter tasks: only return tasks assigned to 'all' or to this user
  // TL sees all tasks regardless of assignment
  const filtered = (tasks ?? []).filter((t: { assign_to: string; excluded_ids: string[] | null }) =>
    profile?.role === "team_leader" ? true : taskAppliesTo(t, user.id),
  );

  const enriched = filtered.map((t: { id: string; assign_to: string }) => ({
    ...t,
    completed: approvedIds.has(t.id),
    completionStatus: (myStatusMap.get(t.id) as string | undefined) ?? "none",
    myReviewNote: (myNoteMap.get(t.id) as string | null | undefined) ?? null,
    completions: profile?.role === "team_leader"
      ? allCompletions.filter((c) => c.task_id === t.id)
      : undefined,
  }));

  return NextResponse.json(
    { tasks: enriched },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can create tasks." }, { status: 403 });
  }

  const body = await request.json();
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim() || null;
  const deadline = body.deadline || null;
  const assign_to = body.assign_to || "all";
  // Members excused from this task. Ids only, deduped — a bad id here would
  // silently exempt nobody, which is the wrong way for this to fail.
  const excluded_ids: string[] = Array.isArray(body.excluded_ids)
    ? [...new Set((body.excluded_ids as unknown[]).filter((id): id is string => typeof id === "string" && !!id))]
    : [];
  const blocker_days_before = Number(body.blocker_days_before) || 0;
  // Both default to the pre-0030 behavior when a caller omits them:
  // approval required, no photo.
  const requires_approval = body.requires_approval !== false;
  const requires_photo = body.requires_photo === true;
  const requires_completion_date = body.requires_completion_date === true;

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
  if (description && description.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });
  if (blocker_days_before < 0) return NextResponse.json({ error: "Blocker days must be 0 or more." }, { status: 400 });

  // Validate assign_to if not 'all'
  if (assign_to !== "all") {
    const { data: target } = await admin.from("profiles").select("id").eq("id", assign_to).single();
    if (!target) return NextResponse.json({ error: "Assigned member not found." }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("member_tasks")
    .insert({
      title,
      description,
      deadline,
      assign_to,
      excluded_ids,
      blocker_days_before: deadline ? blocker_days_before : 0,
      // Absent means yes: a task created without saying otherwise blocks
      // both, which is how every task behaved before these existed.
      blocks_schedule: body.blocks_schedule !== false,
      blocks_leave: body.blocks_leave !== false,
      requires_approval,
      requires_photo,
      requires_completion_date,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[tasks] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't create task." }, { status: 400 });
  }

  // Notify whoever the task landed on — everyone, or the one assignee.
  const recipients = (assign_to === "all" ? await allActiveMemberIds() : [assign_to]).filter(
    (id) => !excluded_ids.includes(id),
  );
  await bellNotify(recipients, user.id, "task_assigned");

  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can edit tasks." }, { status: 403 });
  }

  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "Task ID is required." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
    updates.title = title;
  }
  if (body.description !== undefined) {
    const desc = (body.description ?? "").trim() || null;
    if (desc && desc.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });
    updates.description = desc;
  }
  if (body.deadline !== undefined) updates.deadline = body.deadline || null;
  if (body.assign_to !== undefined) {
    if (body.assign_to !== "all") {
      const { data: target } = await admin.from("profiles").select("id").eq("id", body.assign_to).single();
      if (!target) return NextResponse.json({ error: "Assigned member not found." }, { status: 400 });
    }
    updates.assign_to = body.assign_to;
  }
  if (body.excluded_ids !== undefined) {
    if (!Array.isArray(body.excluded_ids)) {
      return NextResponse.json({ error: "excluded_ids must be a list." }, { status: 400 });
    }
    updates.excluded_ids = [
      ...new Set(
        (body.excluded_ids as unknown[]).filter((id): id is string => typeof id === "string" && !!id),
      ),
    ];
  }
  if (body.blocks_schedule !== undefined) updates.blocks_schedule = body.blocks_schedule === true;
  if (body.blocks_leave !== undefined) updates.blocks_leave = body.blocks_leave === true;
  if (body.requires_approval !== undefined) updates.requires_approval = body.requires_approval === true;
  if (body.requires_photo !== undefined) updates.requires_photo = body.requires_photo === true;
  if (body.requires_completion_date !== undefined)
    updates.requires_completion_date = body.requires_completion_date === true;
  if (body.blocker_days_before !== undefined) {
    const days = Number(body.blocker_days_before);
    if (days < 0) return NextResponse.json({ error: "Blocker days must be 0 or more." }, { status: 400 });
    updates.blocker_days_before = days;
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await admin
    .from("member_tasks")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("[tasks] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can delete tasks." }, { status: 403 });
  }

  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "Task ID is required." }, { status: 400 });

  const { error } = await admin.from("member_tasks").delete().eq("id", id);
  if (error) {
    console.error("[tasks] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

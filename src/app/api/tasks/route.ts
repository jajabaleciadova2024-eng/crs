import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify, allActiveMemberIds } from "@/lib/bellNotify";

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
    .select("task_id, status")
    .eq("profile_id", user.id);

  // Only approved completions count as "done"
  const approvedIds = new Set(
    (myCompletions ?? []).filter((c: { status: string }) => c.status === "approved").map((c: { task_id: string }) => c.task_id),
  );
  // Build a status map for per-task completionStatus
  const myStatusMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; status: string }) => [c.task_id, c.status]),
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
      .select("id, task_id, profile_id, status, completed_at, profiles(first_name, last_name)")
      .order("completed_at", { ascending: false });
    allCompletions = (data ?? []) as unknown as typeof allCompletions;
  }

  // Filter tasks: only return tasks assigned to 'all' or to this user
  // TL sees all tasks regardless of assignment
  const filtered = (tasks ?? []).filter((t: { assign_to: string }) =>
    profile?.role === "team_leader" || t.assign_to === "all" || t.assign_to === user.id,
  );

  const enriched = filtered.map((t: { id: string; assign_to: string }) => ({
    ...t,
    completed: approvedIds.has(t.id),
    completionStatus: (myStatusMap.get(t.id) as string | undefined) ?? "none",
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
  const blocker_days_before = Number(body.blocker_days_before) || 0;

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
      blocker_days_before: deadline ? blocker_days_before : 0,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[tasks] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't create task." }, { status: 400 });
  }

  // Notify whoever the task landed on — everyone, or the one assignee.
  const recipients = assign_to === "all" ? await allActiveMemberIds() : [assign_to];
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

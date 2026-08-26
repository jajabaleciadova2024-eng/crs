import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const task_id = body.task_id;
  const undo = body.undo === true;
  if (!task_id) return NextResponse.json({ error: "task_id is required." }, { status: 400 });

  const admin = createAdminClient();

  // Verify the task exists and is assigned to this user (or all)
  const { data: task } = await admin
    .from("member_tasks")
    .select("id, assign_to, title")
    .eq("id", task_id)
    .single();

  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role, first_name, last_name").eq("id", user.id).single();

  if (task.assign_to !== "all" && task.assign_to !== user.id && profile?.role !== "team_leader") {
    return NextResponse.json({ error: "This task is not assigned to you." }, { status: 403 });
  }

  if (undo) {
    // Can only undo pending completions (not approved ones)
    const { data: deleted } = await admin
      .from("member_task_completions")
      .delete()
      .eq("task_id", task_id)
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .select("id");

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Cannot undo — completion is already approved or does not exist." }, { status: 400 });
    }
  } else {
    // Insert completion with status 'pending' (awaiting TL approval)
    const { error } = await supabase
      .from("member_task_completions")
      .insert({ task_id, profile_id: user.id });

    if (error && !error.message.includes("duplicate")) {
      console.error("[tasks/complete] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify all Team Leaders about the submission
    const { data: leaders } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "team_leader")
      .eq("is_active", true);

    if (leaders && leaders.length > 0) {
      const notifications = leaders.map((tl) => ({
        recipient_id: tl.id,
        actor_id: user.id,
        type: "task_submitted" as const,
        post_id: null,
        comment_id: null,
        reaction: null,
        read: false,
      }));
      await admin.from("notifications").insert(notifications);
    }
  }

  return NextResponse.json({ ok: true });
}

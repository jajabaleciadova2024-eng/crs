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
    .select("id, assign_to")
    .eq("id", task_id)
    .single();

  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();

  if (task.assign_to !== "all" && task.assign_to !== user.id && profile?.role !== "team_leader") {
    return NextResponse.json({ error: "This task is not assigned to you." }, { status: 403 });
  }

  if (undo) {
    // Remove completion
    const { error } = await admin
      .from("member_task_completions")
      .delete()
      .eq("task_id", task_id)
      .eq("profile_id", user.id);

    if (error) {
      console.error("[tasks/complete] undo error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Insert completion (ignore duplicate)
    const { error } = await supabase
      .from("member_task_completions")
      .insert({ task_id, profile_id: user.id });

    if (error && !error.message.includes("duplicate")) {
      console.error("[tasks/complete] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";

// Nudges a member about a task they still owe. Team Leader only, and only
// for a task that is genuinely outstanding for that person — poking someone
// who already submitted is noise, so the server checks rather than trusting
// the button's visibility.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: caller } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can send a nudge." }, { status: 403 });
  }

  const { task_id, profile_ids } = await request.json();
  if (!task_id || !Array.isArray(profile_ids) || profile_ids.length === 0) {
    return NextResponse.json({ error: "task_id and profile_ids are required." }, { status: 400 });
  }

  const { data: task } = await admin
    .from("member_tasks")
    .select("id, assign_to")
    .eq("id", task_id)
    .single();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // Drop anyone the task isn't for, and anyone already approved or awaiting
  // review — a nudge should only ever reach someone who actually owes work.
  const { data: completions } = await admin
    .from("member_task_completions")
    .select("profile_id, status")
    .eq("task_id", task_id)
    .in("profile_id", profile_ids);
  const settled = new Set(
    (completions ?? [])
      .filter((c: { status: string }) => c.status === "approved" || c.status === "pending")
      .map((c: { profile_id: string }) => c.profile_id),
  );

  const targets = (profile_ids as string[]).filter(
    (id) => !settled.has(id) && (task.assign_to === "all" || task.assign_to === id),
  );
  if (targets.length === 0) {
    return NextResponse.json({ error: "Nobody to nudge — they're all up to date." }, { status: 400 });
  }

  await bellNotify(targets, user.id, "task_poke");
  return NextResponse.json({ ok: true, poked: targets.length });
}

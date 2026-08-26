import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can review task completions." }, { status: 403 });
  }

  const body = await request.json();
  const { completion_id, status } = body;
  if (!completion_id) return NextResponse.json({ error: "completion_id is required." }, { status: 400 });
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'." }, { status: 400 });
  }

  // Fetch the completion to get the associate's profile_id
  const { data: completion } = await admin
    .from("member_task_completions")
    .select("id, profile_id, status")
    .eq("id", completion_id)
    .single();

  if (!completion) return NextResponse.json({ error: "Completion not found." }, { status: 404 });
  if (completion.status !== "pending") {
    return NextResponse.json({ error: "This completion has already been reviewed." }, { status: 400 });
  }

  const { error } = await admin
    .from("member_task_completions")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", completion_id);

  if (error) {
    console.error("[tasks/approve] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the associate about the review decision
  await admin.from("notifications").insert({
    recipient_id: completion.profile_id,
    actor_id: user.id,
    type: "task_reviewed" as const,
    post_id: null,
    comment_id: null,
    reaction: null,
    read: false,
  });

  return NextResponse.json({ ok: true });
}

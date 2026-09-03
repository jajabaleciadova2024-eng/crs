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
  const review_note = (body.review_note ?? "").trim() || null;
  if (!completion_id) return NextResponse.json({ error: "completion_id is required." }, { status: 400 });
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'." }, { status: 400 });
  }
  // A decline without a reason leaves the member with nothing to act on —
  // same rule the leave queue applies to a rejection.
  if (status === "rejected" && !review_note) {
    return NextResponse.json({ error: "Please give a reason for declining." }, { status: 400 });
  }
  if (review_note && review_note.length > 1000) {
    return NextResponse.json({ error: "Reason must be under 1000 characters." }, { status: 400 });
  }

  // The pending check is part of the UPDATE, not a read before it. Read,
  // check, then write is a race: two requests for the same completion —
  // a double-click, a retry, two open tabs — both read "pending" before
  // either write lands, so both proceed and the member gets two
  // "reviewed your task completion" notifications. Filtering on
  // status = 'pending' inside the update makes the transition atomic:
  // exactly one request gets a row back, and only that one notifies.
  const { data: updated, error } = await admin
    .from("member_task_completions")
    .update({
      status,
      review_note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", completion_id)
    .eq("status", "pending")
    .select("id, profile_id");

  if (error) {
    console.error("[tasks/approve] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // Either it never existed or somebody (or the same click, twice) got
    // here first. Both are "nothing left to review" from the caller's side.
    const { data: exists } = await admin
      .from("member_task_completions")
      .select("id")
      .eq("id", completion_id)
      .maybeSingle();
    return NextResponse.json(
      { error: exists ? "This completion has already been reviewed." : "Completion not found." },
      { status: exists ? 400 : 404 },
    );
  }

  // Notify the associate about the review decision. Reached only by the
  // request that actually moved the row out of 'pending'.
  await admin.from("notifications").insert({
    recipient_id: updated[0].profile_id,
    actor_id: user.id,
    type: "task_reviewed" as const,
    post_id: null,
    comment_id: null,
    reaction: null,
    read: false,
  });

  return NextResponse.json({ ok: true });
}

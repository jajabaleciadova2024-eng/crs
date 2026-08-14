import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — a single comment with its joined author (admin-backed, same reason
// as /api/feed's GET — used by the client's realtime INSERT handler to
// fetch a newly-arrived comment's author name without hitting the
// profiles-select RLS gap for non-leadership viewers).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: comment, error } = await admin
    .from("post_comments")
    .select(`*, profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url)`)
    .eq("id", commentId)
    .single();

  if (error || !comment) {
    return NextResponse.json({ error: error?.message ?? "Comment not found." }, { status: 404 });
  }

  return NextResponse.json({ comment });
}

// PATCH — edit own comment
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: "Comment can't exceed 1000 characters." }, { status: 400 });

  // RLS enforces author_id = auth.uid() on update
  const { error } = await supabase.from("post_comments").update({ content }).eq("id", commentId);
  if (error) {
    console.error("[feed] comment PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — Team Leader only (moderation). Comment authors can no longer
// self-delete — checked explicitly here (not just left to RLS) so a
// non-TL caller gets a clear 403 instead of a silent no-op delete that
// reports success but changes nothing.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can delete comments." }, { status: 403 });
  }

  const { error } = await supabase.from("post_comments").delete().eq("id", commentId);
  if (error) {
    console.error("[feed] comment DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

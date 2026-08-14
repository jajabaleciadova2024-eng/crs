import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH — edit own comment
// DELETE — delete own comment (or any comment if Team Leader)
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

  // RLS: own comment, or Team Leader (moderation policy)
  const { error } = await supabase.from("post_comments").delete().eq("id", commentId);
  if (error) {
    console.error("[feed] comment DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

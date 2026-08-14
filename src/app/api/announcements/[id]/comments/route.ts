import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: announcementId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Comment can't be empty." }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: "Comment can't exceed 1000 characters." }, { status: 400 });

  const { data: inserted, error } = await supabase
    .from("announcement_comments")
    .insert({ announcement_id: announcementId, author_id: user.id, content })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[announcements] comment POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't post comment." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: comment } = await admin
    .from("announcement_comments")
    .select(`*, profiles!announcement_comments_author_id_fkey(first_name, last_name, avatar_url)`)
    .eq("id", inserted.id)
    .single();

  // Notify announcement author (TL) about the comment
  const { data: ann } = await admin.from("announcements").select("author_id").eq("id", announcementId).single();
  if (ann && ann.author_id !== user.id) {
    const { error: notifError } = await admin.from("notifications").insert({
      recipient_id: ann.author_id,
      actor_id: user.id,
      type: "post_comment",
      post_id: null,
      comment_id: inserted.id,
    });
    if (notifError) console.error("[announcements] comment notification error:", notifError);
  }

  return NextResponse.json({ comment });
}

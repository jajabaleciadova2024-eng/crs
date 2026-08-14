import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPostComment } from "@/lib/feedNotify";

// POST — add a comment to a post
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;
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
    .from("post_comments")
    .insert({ post_id: postId, author_id: user.id, content })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[feed] comment POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't post comment." }, { status: 400 });
  }

  // Re-select through the admin client — see /api/feed's GET for why (RLS
  // on profiles blocks a non-leadership caller from seeing their own
  // comment's author join in edge cases, and this keeps the shape
  // consistent regardless of caller role).
  const admin = createAdminClient();
  const { data: comment } = await admin
    .from("post_comments")
    .select(`*, profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url)`)
    .eq("id", inserted.id)
    .single();

  await notifyPostComment(postId, inserted.id, user.id);

  return NextResponse.json({ comment });
}

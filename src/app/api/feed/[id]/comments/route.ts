import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("post_comments")
    .insert({ post_id: postId, author_id: user.id, content })
    .select(`*, profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url)`)
    .single();

  if (error) {
    console.error("[feed] comment POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ comment: data });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET  — paginated feed (newest first)
// POST — create a new post
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor"); // ISO timestamp of last post seen
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  let query = supabase
    .from("posts")
    .select(
      `*, profiles!posts_author_id_fkey(first_name, last_name, avatar_url, role),
       post_reactions(id, profile_id, reaction),
       post_comments(id, author_id, content, created_at, updated_at,
         profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url))`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  // Order comments oldest-first within each post
  query = query.order("created_at", { referencedTable: "post_comments", ascending: true });

  const { data, error } = await query;
  if (error) {
    console.error("[feed] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data, hasMore: (data?.length ?? 0) === limit });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  const image_url = (body.image_url ?? "").trim() || null;
  if (!content && !image_url) {
    return NextResponse.json({ error: "Post can't be empty." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "Post can't be longer than 2000 characters." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, content: content || "", image_url })
    .select(
      `*, profiles!posts_author_id_fkey(first_name, last_name, avatar_url, role),
       post_reactions(id, profile_id, reaction),
       post_comments(id, author_id, content, created_at, updated_at,
         profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url))`
    )
    .single();

  if (error) {
    console.error("[feed] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ post: data });
}

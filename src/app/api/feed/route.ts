import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify, allActiveMemberIds } from "@/lib/bellNotify";

const FEED_SELECT = `*, profiles!posts_author_id_fkey(first_name, last_name, avatar_url, role),
   post_reactions(id, profile_id, reaction),
   post_comments(id, author_id, content, created_at, updated_at,
     profiles!post_comments_author_id_fkey(first_name, last_name, avatar_url))`;

// GET  — paginated feed (newest first)
// POST — create a new post
//
// Reads go through the admin client (service role, bypasses RLS) — every
// route here still gates on a real signed-in session first, but the actual
// SELECT can't use the request-scoped client: profiles RLS
// ("profiles_select_own_or_leadership") only lets a caller see their OWN
// profile row unless they're Team Leader/OIC, so a plain associate's joined
// `profiles!posts_author_id_fkey(...)` on anyone else's post would come
// back null — and the client renders `post.profiles.first_name` without a
// null-check, which crashed the whole feed (and the page it's on) for
// every non-leadership member. The admin client here only ever returns the
// specific display columns listed in FEED_SELECT, never full rows.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor"); // ISO timestamp of last post seen
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  const admin = createAdminClient();
  let query = admin
    .from("posts")
    .select(FEED_SELECT)
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

  // Insert with the request-scoped client — respects "posts_insert_own" RLS
  // (author_id must equal the caller). The joined re-select below uses the
  // admin client purely for consistency with GET, though a self-join here
  // would actually already be allowed under RLS since it's the caller's
  // own row.
  const { data: inserted, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, content: content || "", image_url })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[feed] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't post." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: post } = await admin.from("posts").select(FEED_SELECT).eq("id", inserted.id).single();

  // Tell everyone else there's a new post (bellNotify skips the author).
  await bellNotify(await allActiveMemberIds(), user.id, "post_new", inserted.id);

  return NextResponse.json({ post });
}

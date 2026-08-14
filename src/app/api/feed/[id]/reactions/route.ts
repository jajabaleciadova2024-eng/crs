import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_REACTIONS = ["like", "heart", "angry"] as const;

// POST — toggle a reaction (upsert: same type = remove, different type = change)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const reaction = body.reaction as string;
  if (!VALID_REACTIONS.includes(reaction as (typeof VALID_REACTIONS)[number])) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }

  // Check if user already reacted to this post
  const { data: existing } = await supabase
    .from("post_reactions")
    .select("id, reaction")
    .eq("post_id", postId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.reaction === reaction) {
      // Same reaction — toggle off (remove)
      await supabase.from("post_reactions").delete().eq("id", existing.id);
      return NextResponse.json({ action: "removed" });
    }
    // Different reaction — switch
    await supabase.from("post_reactions").update({ reaction }).eq("id", existing.id);
    return NextResponse.json({ action: "switched", reaction });
  }

  // No existing reaction — insert
  const { error } = await supabase
    .from("post_reactions")
    .insert({ post_id: postId, profile_id: user.id, reaction });
  if (error) {
    console.error("[feed] reaction error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ action: "added", reaction });
}

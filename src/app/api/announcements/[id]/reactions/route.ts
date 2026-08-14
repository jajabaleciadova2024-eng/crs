import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_REACTIONS = ["like", "heart", "angry", "poop", "roll_eyes"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: announcementId } = await params;
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

  const { data: existing } = await supabase
    .from("announcement_reactions")
    .select("id, reaction")
    .eq("announcement_id", announcementId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.reaction === reaction) {
      await supabase.from("announcement_reactions").delete().eq("id", existing.id);
      return NextResponse.json({ action: "removed" });
    }
    await supabase.from("announcement_reactions").update({ reaction }).eq("id", existing.id);
    return NextResponse.json({ action: "switched", reaction });
  }

  const { error } = await supabase
    .from("announcement_reactions")
    .insert({ announcement_id: announcementId, profile_id: user.id, reaction });
  if (error) {
    console.error("[announcements] reaction error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ action: "added", reaction });
}

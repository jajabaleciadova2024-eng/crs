import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const emoji = body.emoji;
  if (!emoji || typeof emoji !== "string") {
    return NextResponse.json({ error: "Emoji required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Toggle: remove if exists, add if not
  const { data: existing } = await admin
    .from("chat_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("profile_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await admin.from("chat_reactions").delete().eq("id", existing.id);
    return NextResponse.json({ action: "removed" });
  }

  const { error } = await admin
    .from("chat_reactions")
    .insert({ message_id: messageId, profile_id: user.id, emoji });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ action: "already_added" });
    console.error("[chat/react] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify message author
  const { data: msg } = await admin
    .from("chat_messages")
    .select("author_id")
    .eq("id", messageId)
    .single();

  if (msg && msg.author_id !== user.id) {
    bellNotify([msg.author_id], user.id, "chat_reaction" as any, null, messageId);
  }

  return NextResponse.json({ action: "added" });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MSG_SELECT = `
  id, author_id, content, image_url, reply_to_id, original_content,
  created_at, updated_at, deleted_at,
  profiles!chat_messages_author_id_fkey(first_name, last_name, avatar_url, role),
  chat_reactions(id, profile_id, emoji, profiles!chat_reactions_profile_id_fkey(first_name, last_name))
`;

async function attachReplies(admin: ReturnType<typeof createAdminClient>, messages: any[]) {
  const replyIds = [...new Set(messages.map((m) => m.reply_to_id).filter(Boolean))];
  if (replyIds.length === 0) return messages;
  const { data: replies } = await admin
    .from("chat_messages")
    .select("id, author_id, content, profiles!chat_messages_author_id_fkey(first_name, last_name)")
    .in("id", replyIds);
  const replyMap = new Map((replies ?? []).map((r: any) => [r.id, r]));
  return messages.map((m: any) => ({
    ...m,
    reply: m.reply_to_id ? replyMap.get(m.reply_to_id) ?? null : null,
  }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Content required." }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: "Too long." }, { status: 400 });

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("chat_messages")
    .select("author_id, content, original_content")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.author_id !== user.id) return NextResponse.json({ error: "Not yours." }, { status: 403 });

  const originalContent = existing.original_content ?? existing.content;

  const { data: updated, error } = await admin
    .from("chat_messages")
    .update({ content, original_content: originalContent })
    .eq("id", id)
    .select(MSG_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [enriched] = await attachReplies(admin, [updated]);
  return NextResponse.json({ message: enriched });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "team_leader") {
    return NextResponse.json({ error: "Only the Team Leader can delete messages." }, { status: 403 });
  }

  const { error } = await admin
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString(), content: "", image_url: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

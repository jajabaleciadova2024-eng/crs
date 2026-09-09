import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify } from "@/lib/bellNotify";

const PAGE_SIZE = 50;

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

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before");

  const admin = createAdminClient();
  let query = admin
    .from("chat_messages")
    .select(MSG_SELECT)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[chat] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = await attachReplies(admin, data ?? []);

  return NextResponse.json({ messages }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const content = (body.content ?? "").trim();
  const imageUrl = typeof body.image_url === "string" ? body.image_url : null;
  const replyToId = body.reply_to_id ?? null;

  if (!content && !imageUrl) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "Message is too long (2000 max)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: msg, error } = await admin
    .from("chat_messages")
    .insert({ author_id: user.id, content, image_url: imageUrl, reply_to_id: replyToId })
    .select(MSG_SELECT)
    .single();

  if (error) {
    console.error("[chat] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [enriched] = await attachReplies(admin, [msg]);

  // Notify the person being replied to
  if (replyToId) {
    const { data: original } = await admin
      .from("chat_messages")
      .select("author_id")
      .eq("id", replyToId)
      .single();
    if (original && original.author_id !== user.id) {
      bellNotify([original.author_id], user.id, "chat_reply" as any, null, enriched.id);
    }
  }

  return NextResponse.json({ message: enriched }, { status: 201 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns every currently-pinned message (newest pin first), regardless of
// how far back it sits — the pinned bar has to show pins that fall outside
// the 50-message window the main list loads.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .select("id, author_id, content, image_url, created_at, pinned_at, profiles!chat_messages_author_id_fkey(first_name, last_name)")
    .not("pinned_at", "is", null)
    .is("deleted_at", null)
    .order("pinned_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pinned: data ?? [] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

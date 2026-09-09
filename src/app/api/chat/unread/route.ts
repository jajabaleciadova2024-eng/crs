import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Get the user's last-read timestamp
  const { data: cursor } = await admin
    .from("chat_read_cursors")
    .select("last_read_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  const lastReadAt = cursor?.last_read_at ?? "1970-01-01T00:00:00Z";

  // Count messages after that timestamp, excluding own messages
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .gt("created_at", lastReadAt)
    .neq("author_id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("[chat/unread] error:", error);
    return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  return NextResponse.json({ count: count ?? 0 }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

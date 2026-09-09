import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  const { error } = await admin
    .from("chat_read_cursors")
    .upsert(
      { profile_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "profile_id" },
    );

  if (error) {
    console.error("[chat/read] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

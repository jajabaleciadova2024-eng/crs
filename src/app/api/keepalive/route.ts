import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Hit periodically by Vercel Cron (see vercel.json) to keep Supabase's
// free-tier project from auto-pausing after 7 days of inactivity. Does a
// trivial read so it counts as real DB activity, not just an HTTP ping.
export async function GET() {
  const admin = createAdminClient();
  const { error } = await admin.from("org_settings").select("id").limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pinged_at: new Date().toISOString() });
}

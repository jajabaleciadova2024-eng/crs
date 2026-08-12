import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteLeaveDocument } from "@/lib/documentStorage";

// Hit monthly by Vercel Cron (see vercel.json) to purge old leave documents
// from Storage so it doesn't grow unbounded — the leave_requests row itself
// is untouched, just the attached file and its reference. Retention is
// DOCUMENT_RETENTION_DAYS (default 30).
//
// Protected via Vercel's documented cron-auth convention: set CRON_SECRET
// as an env var and Vercel automatically sends it as
// `Authorization: Bearer <CRON_SECRET>` on cron-triggered requests. Without
// CRON_SECRET set, this route refuses to run at all (fails closed).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured — refusing to run." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const retentionDays = Number(process.env.DOCUMENT_RETENTION_DAYS) || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const admin = createAdminClient();
  const { data: stale } = await admin
    .from("leave_requests")
    .select("id, document_path")
    .not("document_path", "is", null)
    .lt("document_uploaded_at", cutoff.toISOString());

  let cleaned = 0;
  for (const row of stale ?? []) {
    if (!row.document_path) continue;
    await deleteLeaveDocument(row.document_path);
    await admin.from("leave_requests").update({ document_path: null, document_uploaded_at: null }).eq("id", row.id);
    cleaned++;
  }

  return NextResponse.json({ ok: true, cleaned, retentionDays });
}

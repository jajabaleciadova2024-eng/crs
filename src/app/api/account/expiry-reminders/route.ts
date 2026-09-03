import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expiryState, daysRemaining, BLOCK_WITHIN_DAYS } from "@/lib/passwordExpiry";

// Daily nudge for passwords entering the warning or blocking window.
//
// password_expiring was declared when this feature was built and never once
// sent: every other notification here is triggered by somebody doing
// something, and an expiry is the one event nobody performs. Without a
// scheduled pass it could only ever have been noticed by opening the page.
//
// Protected the same way as the other crons: Vercel sends
// `Authorization: Bearer <CRON_SECRET>`, and without CRON_SECRET set the
// route refuses to run rather than sitting open.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: statuses }, { data: members }] = await Promise.all([
    admin.from("credential_status").select("profile_id, last_reset_at"),
    admin.from("profiles").select("id, role").eq("is_active", true),
  ]);

  const byProfile = new Map((statuses ?? []).map((s: any) => [s.profile_id, s.last_reset_at as string | null]));

  // One reminder a day at most, and only on days that mean something: the
  // day the warning opens, the day blocking starts, and every day after
  // that. A daily ping through the healthy stretch would train people to
  // ignore the bell.
  const targets: string[] = [];
  for (const m of (members ?? []) as { id: string; role: string }[]) {
    const lastReset = byProfile.get(m.id) ?? null;
    const state = expiryState(lastReset);
    const left = daysRemaining(lastReset);
    if (state === "blocking" || state === "expired") targets.push(m.id);
    else if (state === "warning" && left !== null && left === BLOCK_WITHIN_DAYS * 2) targets.push(m.id);
  }

  if (targets.length === 0) return NextResponse.json({ ok: true, notified: 0 });

  // Deliberately NOT bellNotify: it drops the actor from the recipients so
  // nobody is told about their own action, which is right everywhere else
  // and wrong here — the Team Leader's password expires like anyone's, and
  // with them as actor they would be the one person never reminded. This is
  // the system speaking, so each row is addressed from the recipient to
  // themselves; the bell renders a fixed icon for this type, not an avatar.
  //
  // Guarded against a same-day repeat so a re-run cannot stack duplicates.
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("notifications")
    .select("recipient_id")
    .eq("type", "password_expiring")
    .gte("created_at", since);
  const alreadyTold = new Set((recent ?? []).map((r: { recipient_id: string }) => r.recipient_id));

  const rows = targets
    .filter((id) => !alreadyTold.has(id))
    .map((id) => ({
      recipient_id: id,
      actor_id: id,
      type: "password_expiring" as const,
      post_id: null,
      comment_id: null,
      reaction: null,
      read: false,
    }));

  if (rows.length > 0) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.error("[expiry-reminders] insert failed:", error);
  }

  return NextResponse.json({ ok: true, notified: rows.length, skippedAsRecent: targets.length - rows.length });
}

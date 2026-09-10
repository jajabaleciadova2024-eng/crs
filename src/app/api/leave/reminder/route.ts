import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ANNOUNCEMENT_SHOWINGS } from "@/lib/announcementShowings";

function getActiveReminder(today: Date): { period: string; coverageLabel: string } | null {
  const day = today.getDate();
  const month = today.getMonth();
  const year = today.getFullYear();
  const monthName = today.toLocaleDateString("en-PH", { month: "long" });

  if (day >= 10 && day <= 15) {
    return {
      period: `${year}-${String(month + 1).padStart(2, "0")}-15`,
      coverageLabel: `${monthName} 1–15, ${year}`,
    };
  }

  const lastDay = new Date(year, month + 1, 0).getDate();
  if (day >= 25 && day <= lastDay) {
    return {
      period: `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`,
      coverageLabel: `${monthName} 16–${lastDay}, ${year}`,
    };
  }

  return null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const reminder = getActiveReminder(new Date());
  if (!reminder) {
    return NextResponse.json({ reminder: null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  const currentLogin = user.last_sign_in_at ?? null;

  const { data: existing } = await supabase
    .from("leave_reminder_seen")
    .select("view_count, last_shown_login")
    .eq("profile_id", user.id)
    .eq("period", reminder.period)
    .maybeSingle();

  if (existing) {
    if ((existing.view_count ?? 1) >= ANNOUNCEMENT_SHOWINGS) {
      return NextResponse.json({ reminder: null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    if (currentLogin !== null && existing.last_shown_login === currentLogin) {
      return NextResponse.json({ reminder: null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  }

  const showing = (existing?.view_count ?? 0) + 1;

  return NextResponse.json(
    { reminder: { period: reminder.period, coverageLabel: reminder.coverageLabel }, showing, totalShowings: ANNOUNCEMENT_SHOWINGS },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json();
  const period = body.period;
  if (!period) return NextResponse.json({ error: "Missing period." }, { status: 400 });

  const currentLogin = user.last_sign_in_at ?? null;

  const { data: existing } = await supabase
    .from("leave_reminder_seen")
    .select("id, view_count, last_shown_login")
    .eq("profile_id", user.id)
    .eq("period", period)
    .maybeSingle();

  if (existing) {
    if (currentLogin !== null && existing.last_shown_login === currentLogin) {
      return NextResponse.json({ ok: true, viewCount: existing.view_count });
    }
    const next = Math.min((existing.view_count ?? 1) + 1, ANNOUNCEMENT_SHOWINGS);
    await supabase
      .from("leave_reminder_seen")
      .update({ view_count: next, last_shown_login: currentLogin, seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, viewCount: next });
  }

  await supabase.from("leave_reminder_seen").insert({
    profile_id: user.id,
    period,
    view_count: 1,
    last_shown_login: currentLogin,
  });

  return NextResponse.json({ ok: true, viewCount: 1 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { toTitleCase, formatFullName } from "@/lib/format";

const ANN_SELECT = `*, profiles!announcements_author_id_fkey(first_name, last_name, avatar_url, role),
   announcement_reactions(id, profile_id, reaction),
   announcement_comments(id, author_id, content, created_at, updated_at,
     profiles!announcement_comments_author_id_fkey(first_name, last_name, avatar_url))`;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

  const admin = createAdminClient();
  let query = admin
    .from("announcements")
    .select(ANN_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  query = query.order("created_at", { referencedTable: "announcement_comments", ascending: true });

  const { data, error } = await query;
  if (error) {
    console.error("[announcements] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { announcements: data, hasMore: (data?.length ?? 0) === limit },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Verify TL role
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, first_name, last_name").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can post announcements." }, { status: 403 });
  }

  const body = await request.json();
  const title = (body.title ?? "").trim();
  const announcementBody = (body.body ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!announcementBody) return NextResponse.json({ error: "Description is required." }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
  if (announcementBody.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });

  const { data: inserted, error } = await supabase
    .from("announcements")
    .insert({ author_id: user.id, title, body: announcementBody })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[announcements] POST error:", error);
    return NextResponse.json({ error: error?.message ?? "Couldn't post." }, { status: 400 });
  }

  const { data: announcement } = await admin.from("announcements").select(ANN_SELECT).eq("id", inserted.id).single();

  // Mark as seen for the poster so they don't get the unseen modal
  await supabase.from("announcement_seen").insert({ announcement_id: inserted.id, profile_id: user.id });

  // Notify all active members (except the TL posting)
  const { data: members } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .eq("is_active", true)
    .neq("id", user.id);

  if (members && members.length > 0) {
    // Bell notifications — insert for every member
    const notifications = members.map((m) => ({
      recipient_id: m.id,
      actor_id: user.id,
      type: "announcement" as const,
      post_id: null,
      comment_id: null,
    }));
    const { error: notifError } = await admin.from("notifications").insert(notifications);
    if (notifError) console.error("[announcements] notification insert error:", notifError);

    // Email notifications
    const emails = members.map((m) => m.email);
    const authorName = formatFullName(profile.first_name, profile.last_name);
    const result = await sendEmail(
      emails,
      `📢 New Announcement: ${title}`,
      `<p><strong>${authorName}</strong> posted a new announcement:</p>
       <h2 style="margin:8px 0">${title}</h2>
       <p style="white-space:pre-wrap">${announcementBody.slice(0, 500)}${announcementBody.length > 500 ? "…" : ""}</p>
       <p style="margin-top:16px"><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://crsnaga.vercel.app"}/announcements">View in CRS Naga →</a></p>`,
    );
    if (!result.sent) console.error("[announcements] email send failed:", result.reason);
  }

  return NextResponse.json({ announcement });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { toTitleCase, formatFullName } from "@/lib/format";
import {
  uploadAnnouncementImage,
  signAnnouncementImages,
  deleteAnnouncementImages,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/announcementImageStorage";

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

  // Sign every image across the whole page in ONE call, then hand each
  // announcement its own URLs back in the order they were attached.
  const rows = (data ?? []) as { image_paths?: string[] | null }[];
  const allPaths = rows.flatMap((a) => a.image_paths ?? []);
  const signed = await signAnnouncementImages(allPaths);
  let cursorIdx = 0;
  const announcements = rows.map((a) => {
    const n = (a.image_paths ?? []).length;
    const urls = signed.slice(cursorIdx, cursorIdx + n).filter((u): u is string => !!u);
    cursorIdx += n;
    return { ...a, image_urls: urls };
  });

  return NextResponse.json(
    { announcements, hasMore: rows.length === limit },
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

  // Two content types: JSON for a plain text announcement, multipart when
  // images are attached. Reading formData on a JSON body throws, so branch
  // on the header rather than try/catch.
  let title = "";
  let announcementBody = "";
  let files: File[] = [];
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    title = ((form.get("title") as string) ?? "").trim();
    announcementBody = ((form.get("body") as string) ?? "").trim();
    files = form
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    const body = await request.json();
    title = (body.title ?? "").trim();
    announcementBody = (body.body ?? "").trim();
  }
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!announcementBody) return NextResponse.json({ error: "Description is required." }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
  if (announcementBody.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });

  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: `You can attach up to ${MAX_IMAGES} images.` }, { status: 400 });
  }
  for (const f of files) {
    if (!f.type.startsWith("image/")) {
      return NextResponse.json({ error: "Attachments must be images." }, { status: 400 });
    }
    if (f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" is too large (10MB max).` }, { status: 400 });
    }
  }

  // Upload before the insert: an announcement that goes out referencing an
  // image that failed to store is worse than one that never goes out.
  const image_paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const buffer = Buffer.from(await f.arrayBuffer());
    const path = `${user.id}/${Date.now()}-${i}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const uploaded = await uploadAnnouncementImage(path, f.type || "image/jpeg", buffer);
    if (!uploaded.ok) {
      await deleteAnnouncementImages(image_paths);
      return NextResponse.json({ error: uploaded.error }, { status: 400 });
    }
    image_paths.push(path);
  }

  const { data: inserted, error } = await supabase
    .from("announcements")
    .insert({ author_id: user.id, title, body: announcementBody, image_paths })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[announcements] POST error:", error);
    // Nothing points at the uploads now — do not leave them orphaned.
    await deleteAnnouncementImages(image_paths);
    return NextResponse.json({ error: error?.message ?? "Couldn't post." }, { status: 400 });
  }

  const { data: row } = await admin.from("announcements").select(ANN_SELECT).eq("id", inserted.id).single();
  const announcement = row
    ? { ...row, image_urls: (await signAnnouncementImages(image_paths)).filter((u): u is string => !!u) }
    : row;

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

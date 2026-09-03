import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANNOUNCEMENT_SHOWINGS } from "@/lib/announcementShowings";
import { signAnnouncementImages } from "@/lib/announcementImageStorage";

// GET — returns the announcement to pop up on this visit, if any.
//
// An announcement is shown on ANNOUNCEMENT_SHOWINGS separate logins before it
// retires, so a member who clicks past it on the way to their schedule still
// meets it twice more. Two things therefore disqualify an announcement here:
// it has already had its full run, or it has already been shown during the
// login the member is currently in (otherwise every page refresh would pop
// the same modal, and three refreshes would spend the whole run in a minute).
//
// Only one is ever returned — the newest that still qualifies — so modals
// never stack. Older ones queue up behind it and get their own full run.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const currentLogin = user.last_sign_in_at ?? null;

  const { data: seenRows } = await supabase
    .from("announcement_seen")
    .select("announcement_id, view_count, last_shown_login")
    .eq("profile_id", user.id);

  const retiredIds = (seenRows ?? [])
    .filter(
      (r: { view_count: number | null; last_shown_login: string | null }) =>
        (r.view_count ?? 1) >= ANNOUNCEMENT_SHOWINGS ||
        // Already popped during this login — wait for the next one.
        (currentLogin !== null && r.last_shown_login === currentLogin),
    )
    .map((r: { announcement_id: string }) => r.announcement_id);

  let query = admin
    .from("announcements")
    .select("id, title, body, image_paths, created_at, profiles!announcements_author_id_fkey(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(1);

  if (retiredIds.length > 0) {
    // Supabase PostgREST: not.in needs parenthesized, comma-separated list
    query = query.not("id", "in", `(${retiredIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[announcements] unseen GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = data?.[0] as
    | ({ id: string; image_paths?: string[] | null } & Record<string, unknown>)
    | undefined;
  // The modal is where most people actually read an announcement, so its
  // images have to come through here too, not only in the feed.
  const announcement = raw
    ? {
        ...raw,
        image_urls: (await signAnnouncementImages(raw.image_paths ?? [])).filter(
          (u): u is string => !!u,
        ),
      }
    : null;

  // Which showing this is (1-based) so the modal can say so. A member who
  // knows they are on 2 of 3 knows it is the same notice, not a new one.
  const prior = announcement
    ? ((seenRows ?? []).find(
        (r: { announcement_id: string }) => r.announcement_id === announcement.id,
      )?.view_count ?? 0)
    : 0;

  return NextResponse.json(
    { announcement, showing: prior + 1, totalShowings: ANNOUNCEMENT_SHOWINGS },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

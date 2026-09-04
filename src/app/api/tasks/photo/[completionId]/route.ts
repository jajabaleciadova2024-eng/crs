import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaskPhotoLinks } from "@/lib/taskPhotoStorage";
import { slugForFilename } from "@/lib/csv";

// Mints a short-lived signed URL for a completion's proof photo. The bucket
// is private with no storage policies, so this route IS the access check:
// the Team Leader, or the member who uploaded it, and nobody else.
export async function GET(_request: Request, { params }: { params: Promise<{ completionId: string }> }) {
  const { completionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: completion }, { data: profile }] = await Promise.all([
    admin
      .from("member_task_completions")
      // "*" covers photo_paths without naming it: on a database that hasn't
      // had 0044 applied yet, naming it fails the whole query and every
      // proof photo becomes unopenable, not just the multi-image ones.
      .select("*, member_tasks(title), profiles!member_task_completions_profile_id_fkey(first_name, last_name)")
      .eq("id", completionId)
      .single(),
    admin.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = completion as any;
  // photo_paths is the truth; photo_path is the pre-0044 single upload.
  const paths: string[] = raw?.photo_paths?.length
    ? raw.photo_paths
    : raw?.photo_path
      ? [raw.photo_path]
      : [];
  if (paths.length === 0) return NextResponse.json({ error: "No photo on this completion." }, { status: 404 });
  if (profile?.role !== "team_leader" && raw.profile_id !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  // Named for what it is, not for the storage key. The stored path is
  // "<task id>/<profile id>-<timestamp>-<original name>", so downloading a
  // dozen proofs straight into one folder produced a dozen files nobody
  // could tell apart. Task and member instead, keeping the extension.
  const who = [raw.profiles?.first_name, raw.profiles?.last_name].filter(Boolean).join(" ");
  const stem = [raw.member_tasks?.title, who].filter(Boolean).join(" - ") || "task-proof";
  const base = slugForFilename(stem);

  const photos = [];
  for (const [i, path] of paths.entries()) {
    const ext = (path.split(".").pop() ?? "jpg").slice(0, 5);
    // Numbered only when there is more than one, so a single proof keeps the
    // clean "<Task> - <Member>.jpg" name it already had.
    const fileName = paths.length > 1 ? `${base}-${i + 1}.${ext}` : `${base}.${ext}`;
    const links = await getTaskPhotoLinks(path, fileName);
    if (links) photos.push({ ...links, fileName });
  }

  if (photos.length === 0) {
    return NextResponse.json({ error: "Couldn't open the photo." }, { status: 500 });
  }

  // The single-photo fields are still returned so a page loaded before this
  // deploy keeps working until it is refreshed.
  return NextResponse.json({
    photos,
    ...photos[0],
    url: photos[0].viewUrl,
  });
}

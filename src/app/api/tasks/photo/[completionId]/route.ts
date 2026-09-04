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
      .select("id, profile_id, photo_path, member_tasks(title), profiles!member_task_completions_profile_id_fkey(first_name, last_name)")
      .eq("id", completionId)
      .single(),
    admin.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  if (!completion?.photo_path) return NextResponse.json({ error: "No photo on this completion." }, { status: 404 });
  if (profile?.role !== "team_leader" && completion.profile_id !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  // Named for what it is, not for the storage key. The stored path is
  // "<task id>/<profile id>-<timestamp>-<original name>", so downloading a
  // dozen proofs straight into one folder produced a dozen files nobody
  // could tell apart. Task and member instead, keeping the extension.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = completion as any;
  const ext = (completion.photo_path.split(".").pop() ?? "jpg").slice(0, 5);
  const who = [c.profiles?.first_name, c.profiles?.last_name].filter(Boolean).join(" ");
  const stem = [c.member_tasks?.title, who].filter(Boolean).join(" - ") || "task-proof";
  const fileName = `${slugForFilename(stem)}.${ext}`;

  const links = await getTaskPhotoLinks(completion.photo_path, fileName);
  if (!links) return NextResponse.json({ error: "Couldn't open the photo." }, { status: 500 });
  // `url` kept alongside viewUrl so a page loaded before this deploy keeps
  // working until it is refreshed.
  return NextResponse.json({ ...links, url: links.viewUrl, fileName });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaskPhotoUrl } from "@/lib/taskPhotoStorage";

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
    admin.from("member_task_completions").select("id, profile_id, photo_path").eq("id", completionId).single(),
    admin.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  if (!completion?.photo_path) return NextResponse.json({ error: "No photo on this completion." }, { status: 404 });
  if (profile?.role !== "team_leader" && completion.profile_id !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const url = await getTaskPhotoUrl(completion.photo_path);
  if (!url) return NextResponse.json({ error: "Couldn't open the photo." }, { status: 500 });
  return NextResponse.json({ url });
}

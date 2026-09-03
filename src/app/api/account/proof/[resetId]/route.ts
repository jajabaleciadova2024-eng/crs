import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResetProofUrl } from "@/lib/credentialStorage";

// Short-lived signed URL for a reset screenshot. The bucket has no storage
// policies, so this route IS the access check: the Team Leader, or the
// member whose proof it is.
export async function GET(_r: Request, { params }: { params: Promise<{ resetId: string }> }) {
  const { resetId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: reset }, { data: caller }] = await Promise.all([
    admin.from("password_resets").select("id, profile_id, proof_path").eq("id", resetId).single(),
    admin.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  if (!reset?.proof_path) return NextResponse.json({ error: "No screenshot on this reset." }, { status: 404 });
  if (caller?.role !== "team_leader" && reset.profile_id !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const url = await getResetProofUrl(reset.proof_path);
  if (!url) return NextResponse.json({ error: "Couldn't open the screenshot." }, { status: 500 });
  return NextResponse.json({ url });
}

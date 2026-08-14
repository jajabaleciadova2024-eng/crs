import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "feed-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Uploads an image for a feed post and returns its public URL.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Image must be under 5 MB." }, { status: 400 });

  const admin = createAdminClient();

  // Ensure bucket exists (idempotent)
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
  });

  if (uploadError) {
    console.error("[feed] image upload error:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: publicUrl });
}

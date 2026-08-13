import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "avatars";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File must be under 2 MB." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ensure bucket exists (idempotent — ignores "already exists" error).
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${user.id}.${ext}`;

  // Remove any previous avatar with a different extension.
  const { data: existing } = await admin.storage.from(BUCKET).list("", { search: user.id });
  if (existing) {
    const toDelete = existing.filter((f) => f.name !== path).map((f) => f.name);
    if (toDelete.length > 0) {
      await admin.storage.from(BUCKET).remove(toDelete);
    }
  }

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Bust caches by appending a timestamp.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;
  await admin.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);

  return NextResponse.json({ avatarUrl });
}

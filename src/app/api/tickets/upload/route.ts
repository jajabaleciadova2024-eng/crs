import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "ticket-attachments";
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB per file

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "File type not allowed. Accepted: images, videos, PDFs, Word, Excel, text." }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File must be under 25 MB." }, { status: 400 });

  const admin = createAdminClient();

  // Ensure bucket exists (idempotent)
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    console.error("[tickets] attachment upload error:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    path,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
  });
}

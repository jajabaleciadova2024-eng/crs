import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "feed-images";

// Hit daily by Vercel Cron (see vercel.json) — deletes posts older than 30
// days and removes their images from Supabase Storage so it doesn't grow
// unbounded. Post rows cascade-delete their reactions and comments.
//
// Protected via Vercel's cron-auth convention: set CRON_SECRET as an env var
// and Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`.
// Without CRON_SECRET set, this route refuses to run (fails closed).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured — refusing to run." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Call the DB function that deletes old posts and returns their image URLs
  const { data: deletedImages, error } = await admin.rpc("cleanup_old_posts", { days_old: 30 });

  if (error) {
    console.error("[feed cleanup] rpc error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clean up storage objects for deleted posts' images
  let storageDeleted = 0;
  if (deletedImages && deletedImages.length > 0) {
    // Extract storage paths from public URLs. Public URL format:
    // https://<project>.supabase.co/storage/v1/object/public/feed-images/<path>
    const paths = (deletedImages as { image_url: string }[])
      .map((row) => {
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const idx = row.image_url.indexOf(marker);
        if (idx === -1) return null;
        return row.image_url.slice(idx + marker.length).split("?")[0];
      })
      .filter(Boolean) as string[];

    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
      if (storageError) {
        console.error("[feed cleanup] storage delete error:", storageError);
      } else {
        storageDeleted = paths.length;
      }
    }
  }

  const total = (deletedImages as unknown[])?.length ?? 0;
  console.log(`[feed cleanup] deleted ${total} old posts, removed ${storageDeleted} images from storage`);

  return NextResponse.json({ ok: true, postsDeleted: total, imagesDeleted: storageDeleted });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadTaskPhoto, deleteTaskPhoto } from "@/lib/taskPhotoStorage";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Two content types: JSON for a plain submit/undo, multipart when the
  // task requires a proof photo. Reading formData on a JSON body throws,
  // so branch on the header rather than try/catch.
  let task_id: string | undefined;
  let undo = false;
  let photo: File | null = null;

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    task_id = (form.get("task_id") as string) || undefined;
    undo = form.get("undo") === "true";
    const f = form.get("photo");
    if (f instanceof File && f.size > 0) photo = f;
  } else {
    const body = await request.json();
    task_id = body.task_id;
    undo = body.undo === true;
  }

  if (!task_id) return NextResponse.json({ error: "task_id is required." }, { status: 400 });
  if (photo && photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo is too large (10MB max)." }, { status: 400 });
  }
  if (photo && !photo.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files can be attached." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the task exists and is assigned to this user (or all)
  const { data: task } = await admin
    .from("member_tasks")
    .select("id, assign_to, title, requires_approval, requires_photo")
    .eq("id", task_id)
    .single();

  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role, first_name, last_name").eq("id", user.id).single();

  if (task.assign_to !== "all" && task.assign_to !== user.id && profile?.role !== "team_leader") {
    return NextResponse.json({ error: "This task is not assigned to you." }, { status: 403 });
  }

  if (undo) {
    // Can only undo pending completions (not approved ones)
    const { data: deleted } = await admin
      .from("member_task_completions")
      .delete()
      .eq("task_id", task_id)
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .select("id, photo_path");

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Cannot undo — completion is already approved or does not exist." }, { status: 400 });
    }
    // Drop the proof photo too — the row that pointed at it is gone, so
    // leaving the object behind just orphans it in the bucket.
    for (const row of deleted) {
      if (row.photo_path) await deleteTaskPhoto(row.photo_path);
    }
  } else {
    if (task.requires_photo && !photo) {
      return NextResponse.json({ error: "This task requires a photo as proof." }, { status: 400 });
    }

    let photo_path: string | null = null;
    if (photo) {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const path = `${task_id}/${user.id}-${Date.now()}-${photo.name}`;
      const uploaded = await uploadTaskPhoto(path, photo.type || "image/jpeg", buffer);
      if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 400 });
      photo_path = path;
    }

    // A task the Team Leader marked as not needing review is approved on
    // submission, so it stops blocking immediately. Otherwise it lands as
    // 'pending' and waits, which is how every task behaved before 0030.
    const autoApprove = task.requires_approval === false;

    // Upsert, not insert: a rejected completion is re-submitted against the
    // same (task_id, profile_id) unique row, and a plain insert would just
    // hit the duplicate and silently leave the old rejection — along with
    // its decline note and stale photo — in place.
    const { error } = await admin.from("member_task_completions").upsert(
      {
        task_id,
        profile_id: user.id,
        photo_path,
        status: autoApprove ? "approved" : "pending",
        completed_at: new Date().toISOString(),
        review_note: null,
        reviewed_by: autoApprove ? user.id : null,
        reviewed_at: autoApprove ? new Date().toISOString() : null,
      },
      { onConflict: "task_id,profile_id" },
    );

    if (error) {
      console.error("[tasks/complete] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Nothing to review, so nobody to notify.
    if (autoApprove) return NextResponse.json({ ok: true, status: "approved" });

    // Notify all Team Leaders about the submission
    const { data: leaders } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "team_leader")
      .eq("is_active", true);

    if (leaders && leaders.length > 0) {
      const notifications = leaders.map((tl) => ({
        recipient_id: tl.id,
        actor_id: user.id,
        type: "task_submitted" as const,
        post_id: null,
        comment_id: null,
        reaction: null,
        read: false,
      }));
      await admin.from("notifications").insert(notifications);
    }
  }

  return NextResponse.json({ ok: true });
}

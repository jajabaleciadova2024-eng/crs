import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadTaskPhoto, deleteTaskPhoto } from "@/lib/taskPhotoStorage";
import { todayInManila } from "@/lib/scheduleDates";
import { taskAppliesTo } from "@/lib/taskAssignment";

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
  // The date the member says the work was actually done — distinct from
  // completed_at, which is when they pressed submit.
  let completion_date: string | null = null;

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    task_id = (form.get("task_id") as string) || undefined;
    undo = form.get("undo") === "true";
    completion_date = (form.get("completion_date") as string) || null;
    const f = form.get("photo");
    if (f instanceof File && f.size > 0) photo = f;
  } else {
    const body = await request.json();
    task_id = body.task_id;
    undo = body.undo === true;
    completion_date = body.completion_date || null;
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
    .select("id, assign_to, excluded_ids, title, requires_approval, requires_photo, requires_completion_date")
    .eq("id", task_id)
    .single();

  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("role, first_name, last_name").eq("id", user.id).single();

  if (!taskAppliesTo(task, user.id) && profile?.role !== "team_leader") {
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

    // Take back the "submitted a task for approval" notice as well. The
    // submission it announced no longer exists, so leaving it in the Team
    // Leader's bell points them at a queue with nothing in it — they go
    // looking for something to approve and find nothing, with no way to
    // tell that it was withdrawn rather than lost. notifications carries no
    // task reference, so this clears the most recent UNREAD one from this
    // member: a read notice is already part of the Team Leader's history
    // and is not rewritten behind them.
    const { data: remaining } = await admin
      .from("member_task_completions")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1);
    if (!remaining || remaining.length === 0) {
      await admin
        .from("notifications")
        .delete()
        .eq("actor_id", user.id)
        .eq("type", "task_submitted")
        .eq("read", false);
    } else {
      const { data: stale } = await admin
        .from("notifications")
        .select("id")
        .eq("actor_id", user.id)
        .eq("type", "task_submitted")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (stale && stale.length > 0) {
        await admin.from("notifications").delete().eq("id", stale[0].id);
      }
    }
  } else {
    if (task.requires_photo && !photo) {
      return NextResponse.json({ error: "This task requires a photo as proof." }, { status: 400 });
    }
    if (task.requires_completion_date && !completion_date) {
      return NextResponse.json({ error: "Please give the date you completed this." }, { status: 400 });
    }
    if (completion_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(completion_date)) {
        return NextResponse.json({ error: "Completion date is not a valid date." }, { status: 400 });
      }
      // A date in the future is a typo, not a completion.
      if (completion_date > todayInManila()) {
        return NextResponse.json({ error: "Completion date can't be in the future." }, { status: 400 });
      }
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

    // Was this member ALREADY waiting on review for this task? The upsert
    // below cannot tell you afterwards — it reports success either way —
    // so it has to be read first. Without it, every re-submit against an
    // already-pending row fired a second "submitted a task for approval"
    // at the Team Leader for the same piece of work: a double-click, a
    // retry after a flaky connection, or a second tab all produced two
    // identical notifications with nothing extra to review.
    const { data: alreadyPending } = await admin
      .from("member_task_completions")
      .select("id")
      .eq("task_id", task_id)
      .eq("profile_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    // Upsert, not insert: a rejected completion is re-submitted against the
    // same (task_id, profile_id) unique row, and a plain insert would just
    // hit the duplicate and silently leave the old rejection — along with
    // its decline note and stale photo — in place.
    const { error } = await admin.from("member_task_completions").upsert(
      {
        task_id,
        profile_id: user.id,
        photo_path,
        completion_date,
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

    // Already in the review queue — the row was refreshed, but no new
    // approval is being asked for. Telling the Team Leader twice about one
    // submission is noise that makes them distrust the count.
    if (alreadyPending) return NextResponse.json({ ok: true, status: "pending" });

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

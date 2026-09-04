import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadTaskPhoto, deleteTaskPhoto } from "@/lib/taskPhotoStorage";
import { todayInManila } from "@/lib/scheduleDates";
import { taskAppliesTo } from "@/lib/taskAssignment";
import { isMissingColumnError } from "@/lib/schemaCompat";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 6; // 10MB

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
  let photos: File[] = [];
  // The date the member says the work was actually done — distinct from
  // completed_at, which is when they pressed submit.
  let completion_date: string | null = null;

  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    task_id = (form.get("task_id") as string) || undefined;
    undo = form.get("undo") === "true";
    completion_date = (form.get("completion_date") as string) || null;
    // getAll: the picker sends one "photo" entry per file now. A single
    // file still arrives as a one-element list, so an older page posting one
    // entry keeps working.
    photos = form.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    const body = await request.json();
    task_id = body.task_id;
    undo = body.undo === true;
    completion_date = body.completion_date || null;
  }

  if (!task_id) return NextResponse.json({ error: "task_id is required." }, { status: 400 });
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `You can attach up to ${MAX_PHOTOS} photos.` }, { status: 400 });
  }
  for (const f of photos) {
    if (f.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: `"${f.name}" is too large (10MB max).` }, { status: 400 });
    }
    if (!f.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files can be attached." }, { status: 400 });
    }
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
      // "*" rather than a column list: photo_paths only exists once 0044 has
      // been run, and naming a column the database doesn't have yet fails the
      // whole delete — leaving the member unable to undo at all.
      .select("*");

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Cannot undo — completion is already approved or does not exist." }, { status: 400 });
    }
    // Drop the proof photo too — the row that pointed at it is gone, so
    // leaving the object behind just orphans it in the bucket.
    for (const row of deleted) {
      const paths: string[] = (row.photo_paths as string[] | null)?.length
        ? (row.photo_paths as string[])
        : row.photo_path
          ? [row.photo_path as string]
          : [];
      for (const path of paths) await deleteTaskPhoto(path);
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
    if (task.requires_photo && photos.length === 0) {
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

    const photo_paths: string[] = [];
    for (const [i, f] of photos.entries()) {
      const buffer = Buffer.from(await f.arrayBuffer());
      const path = `${task_id}/${user.id}-${Date.now()}-${i}-${f.name}`;
      const uploaded = await uploadTaskPhoto(path, f.type || "image/jpeg", buffer);
      if (!uploaded.ok) {
        // Nothing points at the earlier ones yet, so don't strand them.
        for (const done of photo_paths) await deleteTaskPhoto(done);
        return NextResponse.json({ error: uploaded.error }, { status: 400 });
      }
      photo_paths.push(path);
    }

    // Approved on submission in two cases.
    //
    // One: the task was marked as not needing review, so it stops blocking
    // immediately. That is what requires_approval has always meant.
    //
    // Two: the submitter IS the Team Leader. They carry the same courses as
    // everyone else, but approval is their own signature — routing it into
    // a queue for themselves to sign would be theatre, and would leave a
    // "1 awaiting review" on their own dashboard that only they could
    // clear. Same posture as their Account Security row, which records
    // rather than gates.
    const selfApproves = profile?.role === "team_leader";
    const autoApprove = task.requires_approval === false || selfApproves;

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

    const row = {
      task_id,
      profile_id: user.id,
      // Mirrors the first, so anything still reading the single column —
      // the CSV's certificate flag, an un-refreshed page — keeps working.
      photo_path: photo_paths[0] ?? null,
      completion_date,
      status: autoApprove ? "approved" : "pending",
      completed_at: new Date().toISOString(),
      review_note: null,
      reviewed_by: autoApprove ? user.id : null,
      reviewed_at: autoApprove ? new Date().toISOString() : null,
    };

    // Upsert, not insert: a rejected completion is re-submitted against the
    // same (task_id, profile_id) unique row, and a plain insert would just
    // hit the duplicate and silently leave the old rejection — along with
    // its decline note and stale photo — in place.
    let { error } = await admin
      .from("member_task_completions")
      .upsert({ ...row, photo_paths }, { onConflict: "task_id,profile_id" });

    // The database may not have 0044 yet — migrations are applied by hand.
    // Without this the member saw "Could not find the 'photo_paths' column
    // ... in the schema cache" under the Submit button and lost the
    // submission entirely; now the first photo goes in through the old
    // column and the rest wait for the migration.
    if (isMissingColumnError(error, "photo_paths")) {
      console.warn("[tasks/complete] photo_paths is missing — run supabase/migrations/0044_task_photo_paths.sql");
      ({ error } = await admin
        .from("member_task_completions")
        .upsert(row, { onConflict: "task_id,profile_id" }));
      // Nothing can point at the extra images, so don't leave them in the bucket.
      for (const stranded of photo_paths.slice(1)) await deleteTaskPhoto(stranded);
    }

    if (error) {
      console.error("[tasks/complete] POST error:", error);
      // The photos are unreferenced now — the row that would have pointed at
      // them was never written. Leaving them behind fills the bucket with
      // images nothing can ever show or delete.
      for (const stranded of photo_paths) await deleteTaskPhoto(stranded);
      return NextResponse.json({ error: "Couldn't save your submission. Please try again." }, { status: 500 });
    }

    // Nothing to review, so nobody to notify — including the Team Leader
    // about their own submission.
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

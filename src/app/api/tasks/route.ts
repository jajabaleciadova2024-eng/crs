import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bellNotify, allActiveMemberIds } from "@/lib/bellNotify";
import { taskAppliesTo } from "@/lib/taskAssignment";
import {
  uploadTaskSamplePhoto,
  signTaskSamplePhotos,
  deleteTaskSamplePhotos,
  taskSamplePath,
  MAX_SAMPLE_PHOTOS,
  MAX_SAMPLE_BYTES,
} from "@/lib/taskSampleStorage";
import { isMissingColumnError, withMissingColumnFallback } from "@/lib/schemaCompat";

/**
 * The request body as the handlers below read it. Deliberately loose: every
 * field is re-validated here, and a caller may omit any of them — the same
 * shape `request.json()` handed back before multipart existed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TaskRequestBody = Record<string, any>;

/**
 * Two content types: JSON for a plain task, multipart when the Team Leader
 * attaches sample photos. Reading formData on a JSON body throws, so branch
 * on the header rather than try/catch.
 *
 * The task form is far too structured to flatten into form fields — nested
 * arrays, booleans that mean something different when absent — so under
 * multipart it rides along whole, as one JSON blob beside the files.
 */
async function readTaskRequest(
  request: Request,
): Promise<{ body: TaskRequestBody; samples: File[] } | null> {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") return null;
    let body: TaskRequestBody;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
    const samples = form
      .getAll("sample_photo")
      .filter((f): f is File => f instanceof File && f.size > 0);
    return { body, samples };
  }
  return { body: await request.json(), samples: [] };
}

/** What the bucket will accept, checked before anything is uploaded. */
function rejectBadSamples(files: File[]): string | null {
  for (const f of files) {
    if (!f.type.startsWith("image/")) return "Sample photos must be images.";
    if (f.size > MAX_SAMPLE_BYTES) return `"${f.name}" is too large (10MB max).`;
  }
  return null;
}

/** Uploads in attachment order, cleaning up after itself if one fails. */
async function storeSamples(ownerId: string, files: File[]) {
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const buffer = Buffer.from(await f.arrayBuffer());
    const uploaded = await uploadTaskSamplePhoto(
      taskSamplePath(ownerId, i, f.name),
      f.type || "image/jpeg",
      buffer,
    );
    if (!uploaded.ok) {
      await deleteTaskSamplePhotos(paths);
      return { ok: false as const, error: uploaded.error };
    }
    paths.push(uploaded.path);
  }
  return { ok: true as const, paths };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();

  // Fetch all tasks with creator info
  const { data: tasks, error } = await admin
    .from("member_tasks")
    .select("*, profiles!member_tasks_created_by_fkey(first_name, last_name)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tasks] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch completions for the current user (with status)
  const { data: myCompletions } = await admin
    .from("member_task_completions")
    .select("task_id, status, review_note, photo_path")
    .eq("profile_id", user.id);

  // Only approved completions count as "done"
  const approvedIds = new Set(
    (myCompletions ?? []).filter((c: { status: string }) => c.status === "approved").map((c: { task_id: string }) => c.task_id),
  );
  // Build a status map for per-task completionStatus
  const myStatusMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; status: string }) => [c.task_id, c.status]),
  );
  // The Team Leader's reason for declining, surfaced back to the member on
  // their own card — same as a rejected leave request shows its review_note.
  const myNoteMap = new Map(
    (myCompletions ?? []).map((c: { task_id: string; review_note: string | null }) => [c.task_id, c.review_note]),
  );

  // Fetch all completions (for TL to see progress)
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let allCompletions: { id: string; task_id: string; profile_id: string; status: string; completed_at: string; profiles: { first_name: string; last_name: string } | null }[] = [];
  if (profile?.role === "team_leader") {
    const { data } = await admin
      .from("member_task_completions")
      .select("id, task_id, profile_id, status, completed_at, completion_date, photo_path, review_note, profiles!member_task_completions_profile_id_fkey(first_name, last_name)")
      .order("completed_at", { ascending: false });
    allCompletions = (data ?? []) as unknown as typeof allCompletions;
  }

  // Filter tasks: only return tasks assigned to 'all' or to this user
  // TL sees all tasks regardless of assignment
  const filtered = (tasks ?? []).filter((t: { assign_to: string; excluded_ids: string[] | null }) =>
    profile?.role === "team_leader" ? true : taskAppliesTo(t, user.id),
  );

  // The Team Leader's sample photos, signed for the whole page in one call.
  // They are a guide everyone the task is for is meant to look at, so they
  // are handed over with the task rather than fetched per click the way a
  // member's own proof is.
  const sampleUrls = await signTaskSamplePhotos(
    (filtered as { sample_photo_paths?: string[] | null }[]).flatMap((t) => t.sample_photo_paths ?? []),
  );

  const enriched = filtered.map((t: { id: string; assign_to: string; sample_photo_paths?: string[] | null }) => ({
    ...t,
    completed: approvedIds.has(t.id),
    completionStatus: (myStatusMap.get(t.id) as string | undefined) ?? "none",
    myReviewNote: (myNoteMap.get(t.id) as string | null | undefined) ?? null,
    // Index-aligned with sample_photo_paths: a path that failed to sign is
    // null rather than missing, so the two lists stay in step.
    sample_photo_urls: (t.sample_photo_paths ?? []).map((path) => sampleUrls.get(path) ?? null),
    completions: profile?.role === "team_leader"
      ? allCompletions.filter((c) => c.task_id === t.id)
      : undefined,
  }));

  return NextResponse.json(
    { tasks: enriched },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can create tasks." }, { status: 403 });
  }

  const parsed = await readTaskRequest(request);
  if (!parsed) return NextResponse.json({ error: "Couldn't read the task details." }, { status: 400 });
  const { body, samples } = parsed;
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim() || null;
  const deadline = body.deadline || null;
  const assign_to = body.assign_to || "all";
  // Members excused from this task. Ids only, deduped — a bad id here would
  // silently exempt nobody, which is the wrong way for this to fail.
  // Excusing somebody only means something if they could otherwise be
  // assigned, so ids that match no active member are dropped rather than
  // stored — that is what left a count with no name behind it before.
  const assignable = new Set(await allActiveMemberIds());
  const excluded_ids: string[] = Array.isArray(body.excluded_ids)
    ? [
        ...new Set(
          (body.excluded_ids as unknown[]).filter(
            (id): id is string => typeof id === "string" && assignable.has(id),
          ),
        ),
      ]
    : [];
  const blocker_days_before = Number(body.blocker_days_before) || 0;
  // Both default to the pre-0030 behavior when a caller omits them:
  // approval required, no photo.
  const requires_approval = body.requires_approval !== false;
  const requires_photo = body.requires_photo === true;
  const requires_completion_date = body.requires_completion_date === true;

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
  if (description && description.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });
  if (blocker_days_before < 0) return NextResponse.json({ error: "Blocker days must be 0 or more." }, { status: 400 });
  if (samples.length > MAX_SAMPLE_PHOTOS) {
    return NextResponse.json({ error: `You can attach up to ${MAX_SAMPLE_PHOTOS} sample photos.` }, { status: 400 });
  }
  const badSample = rejectBadSamples(samples);
  if (badSample) return NextResponse.json({ error: badSample }, { status: 400 });

  // Validate assign_to if not 'all'
  if (assign_to !== "all") {
    const { data: target } = await admin
      .from("profiles")
      .select("id")
      .eq("id", assign_to)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "Assigned member not found." }, { status: 400 });
  }

  // Upload before the insert: a task that goes out pointing at a sample
  // image that failed to store is worse than one that never goes out.
  const stored = await storeSamples(user.id, samples);
  if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 400 });
  const sample_photo_paths = stored.paths;

  const insertTask = (extra: Record<string, unknown>) =>
    supabase
      .from("member_tasks")
      .insert({
        title,
        description,
        deadline,
        assign_to,
        excluded_ids,
        blocker_days_before: deadline ? blocker_days_before : 0,
        // Absent means yes: a task created without saying otherwise blocks
        // both, which is how every task behaved before these existed.
        blocks_schedule: body.blocks_schedule !== false,
        blocks_leave: body.blocks_leave !== false,
        requires_approval,
        requires_photo,
        requires_completion_date,
        created_by: user.id,
        ...extra,
      })
      .select("id")
      .single();

  // 0048 is applied by hand like every migration here, so a deploy can land
  // before the column exists. The task itself still has to be creatable —
  // losing the samples is a far smaller failure than a Team Leader who
  // cannot create tasks at all.
  const { data: inserted, error } = await withMissingColumnFallback(
    "sample_photo_paths",
    () => insertTask({ sample_photo_paths }),
    async () => {
      await deleteTaskSamplePhotos(sample_photo_paths);
      return insertTask({});
    },
  );

  if (error || !inserted) {
    console.error("[tasks] POST error:", error);
    // Nothing points at the uploads now — do not leave them orphaned.
    await deleteTaskSamplePhotos(sample_photo_paths);
    return NextResponse.json({ error: error?.message ?? "Couldn't create task." }, { status: 400 });
  }

  // Notify whoever the task landed on — everyone, or the one assignee.
  const recipients = (
    assign_to === "all" ? await allActiveMemberIds() : [assign_to]
  ).filter((id) => !excluded_ids.includes(id));
  await bellNotify(recipients, user.id, "task_assigned", null, inserted.id);

  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can edit tasks." }, { status: 403 });
  }

  const parsed = await readTaskRequest(request);
  if (!parsed) return NextResponse.json({ error: "Couldn't read the task details." }, { status: 400 });
  const { body, samples } = parsed;
  const id = body.id;
  if (!id) return NextResponse.json({ error: "Task ID is required." }, { status: 400 });
  if (samples.length > MAX_SAMPLE_PHOTOS) {
    return NextResponse.json({ error: `You can attach up to ${MAX_SAMPLE_PHOTOS} sample photos.` }, { status: 400 });
  }
  const badSample = rejectBadSamples(samples);
  if (badSample) return NextResponse.json({ error: badSample }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ error: "Title must be under 200 characters." }, { status: 400 });
    updates.title = title;
  }
  if (body.description !== undefined) {
    const desc = (body.description ?? "").trim() || null;
    if (desc && desc.length > 5000) return NextResponse.json({ error: "Description must be under 5000 characters." }, { status: 400 });
    updates.description = desc;
  }
  if (body.deadline !== undefined) updates.deadline = body.deadline || null;
  if (body.assign_to !== undefined) {
    if (body.assign_to !== "all") {
      const { data: target } = await admin
        .from("profiles")
        .select("id")
        .eq("id", body.assign_to)
        .maybeSingle();
      if (!target) return NextResponse.json({ error: "Assigned member not found." }, { status: 400 });
    }
    updates.assign_to = body.assign_to;
  }
  if (body.excluded_ids !== undefined) {
    if (!Array.isArray(body.excluded_ids)) {
      return NextResponse.json({ error: "excluded_ids must be a list." }, { status: 400 });
    }
    const assignable = new Set(await allActiveMemberIds());
    updates.excluded_ids = [
      ...new Set(
        (body.excluded_ids as unknown[]).filter(
          (id): id is string => typeof id === "string" && assignable.has(id),
        ),
      ),
    ];
  }
  if (body.blocks_schedule !== undefined) updates.blocks_schedule = body.blocks_schedule === true;
  if (body.blocks_leave !== undefined) updates.blocks_leave = body.blocks_leave === true;
  if (body.requires_approval !== undefined) updates.requires_approval = body.requires_approval === true;
  if (body.requires_photo !== undefined) updates.requires_photo = body.requires_photo === true;
  if (body.requires_completion_date !== undefined)
    updates.requires_completion_date = body.requires_completion_date === true;
  if (body.blocker_days_before !== undefined) {
    const days = Number(body.blocker_days_before);
    if (days < 0) return NextResponse.json({ error: "Blocker days must be 0 or more." }, { status: 400 });
    updates.blocker_days_before = days;
  }

  // Sample photos, when the edit touched them at all. The form sends the
  // paths it kept — anything stored but not sent back was removed in the
  // modal — and the new files arrive alongside as uploads.
  //
  // Nothing is deleted from the bucket until the row that points at it has
  // actually been updated: an edit that fails halfway must not take the
  // Team Leader's samples with it.
  let addedSamples: string[] = [];
  let removedSamples: string[] = [];
  if (samples.length > 0 || body.sample_photo_paths !== undefined) {
    const { data: current, error: readError } = await admin
      .from("member_tasks")
      .select("sample_photo_paths")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      // Either way the rest of the edit goes through and the samples are
      // left exactly as they were: nothing has been uploaded yet, so there
      // is nothing to clean up, and guessing at what the task currently
      // holds would throw away samples this edit never meant to touch.
      if (isMissingColumnError(readError, "sample_photo_paths")) {
        // Pre-0048 database. The [schemaCompat] warning says what to run.
        console.warn(
          "[schemaCompat] 'sample_photo_paths' is missing from the database — sample photos were not saved. Run the pending migration in supabase/migrations.",
        );
      } else {
        console.error("[tasks] PATCH couldn't read sample photos:", readError);
      }
    } else {
      const existing: string[] = (current?.sample_photo_paths as string[] | null) ?? [];
      // Only paths that are genuinely on this task — a caller cannot keep
      // (or reach) an object belonging to another one.
      const keep = Array.isArray(body.sample_photo_paths)
        ? (body.sample_photo_paths as unknown[]).filter(
            (path): path is string => typeof path === "string" && existing.includes(path),
          )
        : existing;

      if (keep.length + samples.length > MAX_SAMPLE_PHOTOS) {
        return NextResponse.json(
          { error: `You can attach up to ${MAX_SAMPLE_PHOTOS} sample photos.` },
          { status: 400 },
        );
      }

      const stored = await storeSamples(user.id, samples);
      if (!stored.ok) return NextResponse.json({ error: stored.error }, { status: 400 });

      addedSamples = stored.paths;
      removedSamples = existing.filter((path) => !keep.includes(path));
      updates.sample_photo_paths = [...keep, ...addedSamples];
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await withMissingColumnFallback(
    "sample_photo_paths",
    () => admin.from("member_tasks").update(updates).eq("id", id),
    async () => {
      // The column landed after this deploy's read above, or never existed:
      // save everything else and drop what was just uploaded rather than
      // orphaning it.
      await deleteTaskSamplePhotos(addedSamples);
      addedSamples = [];
      removedSamples = [];
      const rest = { ...updates };
      delete rest.sample_photo_paths;
      return admin.from("member_tasks").update(rest).eq("id", id);
    },
  );

  if (error) {
    console.error("[tasks] PATCH error:", error);
    // The row still points at what it did before — the new uploads are
    // orphans now, and the removed ones are still in use.
    await deleteTaskSamplePhotos(addedSamples);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Safe now: the task no longer points at them.
  await deleteTaskSamplePhotos(removedSamples);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "team_leader") {
    return NextResponse.json({ error: "Only Team Leaders can delete tasks." }, { status: 403 });
  }

  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: "Task ID is required." }, { status: 400 });

  // "*" rather than naming the column: sample_photo_paths only exists once
  // 0048 has been run, and asking for a column the database does not have
  // would fail the whole delete.
  const { data: doomed } = await admin.from("member_tasks").select("*").eq("id", id).maybeSingle();

  const { error } = await admin.from("member_tasks").delete().eq("id", id);
  if (error) {
    console.error("[tasks] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The task that pointed at them is gone; leaving the objects behind just
  // orphans them in the bucket.
  await deleteTaskSamplePhotos((doomed?.sample_photo_paths as string[] | null) ?? []);

  return NextResponse.json({ ok: true });
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";
import {
  shrinkImagesForUpload,
  readUploadError,
  NETWORK_ERROR_MESSAGE,
} from "@/lib/imageUpload";

// Enough for a good example, a bad one, and a close-up. Mirrors
// MAX_SAMPLE_PHOTOS in src/lib/taskSampleStorage.ts, which is server-only
// and so cannot be imported here.
const MAX_SAMPLE_PHOTOS = 3;
// The ceiling on what can be PICKED. Samples are re-encoded before they are
// sent, so this only has to keep something absurd out of the browser's
// memory — what actually goes over the wire is decided later.
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

interface TaskForm {
  title: string;
  description: string;
  deadline: string;
  assign_to: string;
  blocker_days_before: string;
  requires_approval: boolean;
  requires_photo: boolean;
  requires_completion_date: boolean;
  blocks_schedule: boolean;
  blocks_leave: boolean;
}

const EMPTY: TaskForm = {
  title: "",
  description: "",
  deadline: "",
  assign_to: "all",
  blocker_days_before: "0",
  requires_approval: true,
  requires_photo: false,
  requires_completion_date: false,
  blocks_schedule: true,
  blocks_leave: true,
};

export default function TaskModal({
  members,
  editTask,
  onClose,
}: {
  members: { id: string; first_name: string; last_name: string }[];
  editTask?: {
    id: string;
    title: string;
    description: string | null;
    deadline: string | null;
    assign_to: string;
    blocker_days_before: number;
    requires_approval?: boolean;
    requires_photo?: boolean;
    requires_completion_date?: boolean;
    excluded_ids?: string[] | null;
    blocks_schedule?: boolean;
    blocks_leave?: boolean;
    /** Sample photos already stored, and the signed URLs to preview them —
        index-aligned, with null where a path failed to sign. */
    sample_photo_paths?: string[] | null;
    sample_photo_urls?: (string | null)[] | null;
    /** Used only to keep people who have already acted out of the exclusion
        list — excusing them from work they have done means nothing. */
    completions?: { profile_id: string; status: string }[];
  } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = !!editTask;
  const [form, setForm] = useState<TaskForm>(
    editTask
      ? {
          title: editTask.title,
          description: editTask.description ?? "",
          deadline: editTask.deadline ?? "",
          assign_to: editTask.assign_to,
          blocker_days_before: String(editTask.blocker_days_before),
          // Tasks created before 0030 have no stored value; they behaved as
          // approval-required, no photo, so that is what they edit as.
          requires_approval: editTask.requires_approval ?? true,
          requires_photo: editTask.requires_photo ?? false,
          requires_completion_date: editTask.requires_completion_date ?? false,
          // Tasks predating 0042 have neither flag, and back then a blocking
          // task blocked everything — so absent edits as both on.
          blocks_schedule: editTask.blocks_schedule ?? true,
          blocks_leave: editTask.blocks_leave ?? true,
        }
      : EMPTY,
  );
  // Members excused from this task. Kept out of TaskForm because it is a
  // set, not a form field, and the whole point is toggling one name at a
  // time without disturbing the rest.
  const [excluded, setExcluded] = useState<Set<string>>(
    () =>
      new Set(
        // Only ids that are still on the roster. A Team Leader excluded
        // before they stopped being assignable leaves an id here that
        // matches no chip — so the count read "1 excluded" with nothing
        // struck through, describing somebody who is excluded by role
        // anyway. Dropping it here also cleans the stored value on save.
        (editTask?.excluded_ids ?? []).filter((id) => members.some((m) => m.id === id)),
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Re-encoding a few phone photos takes a moment and it happens after the
  // press, so the button says which step is running rather than looking stuck.
  const [preparing, setPreparing] = useState(false);

  // Sample photos: the Team Leader's own examples of what a proof should
  // show. Members guessed before — the same work photographed the wrong way
  // came back through the review queue again and again with nothing to point
  // at. Two lists, because they behave differently on save: the ones already
  // stored are kept (or dropped) by path, the newly picked ones are uploaded.
  // Every stored path stays on this list even when its preview could not be
  // signed: dropping it here would send it back as "not kept", and a
  // momentary signing failure would silently delete the Team Leader's sample.
  const [keptSamples, setKeptSamples] = useState<{ path: string; url: string | null }[]>(() =>
    (editTask?.sample_photo_paths ?? []).map((path, i) => ({
      path,
      url: editTask?.sample_photo_urls?.[i] ?? null,
    })),
  );
  type PickedSample = { file: File; url: string };
  const [newSamples, setNewSamples] = useState<PickedSample[]>([]);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const sampleCount = keptSamples.length + newSamples.length;

  // Object URLs are a manual resource, created WITH the file in the handler
  // that picked it. They still have to be revoked by hand — the ref keeps
  // this effect from re-running (and revoking live previews) on every pick.
  const newSamplesRef = useRef<PickedSample[]>([]);
  useEffect(() => {
    newSamplesRef.current = newSamples;
  }, [newSamples]);
  useEffect(() => {
    return () => {
      for (const p of newSamplesRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  function chooseSamples(picked: FileList | null) {
    if (!picked) return;
    setSampleError(null);
    const incoming = [...picked];
    const notImage = incoming.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      setSampleError("Only images can be attached as a sample.");
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_SOURCE_BYTES);
    if (tooBig) {
      setSampleError(`"${tooBig.name}" is too large (25MB max).`);
      return;
    }
    setNewSamples((prev) => {
      // Adding, not replacing — picking a second time extends the set.
      const room = MAX_SAMPLE_PHOTOS - keptSamples.length - prev.length;
      if (incoming.length > room) {
        setSampleError(`Up to ${MAX_SAMPLE_PHOTOS} sample photos — the rest were left out.`);
      }
      const taken = incoming.slice(0, Math.max(0, room));
      return [...prev, ...taken.map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }

  function removeNewSample(index: number) {
    setNewSamples((prev) => {
      const gone = prev[index];
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Anyone who has already submitted — approved, or waiting on review.
  // Excusing them is a no-op at best and confusing at worst: the point of
  // the list is people who still owe the work.
  const settled = new Set(
    (editTask?.completions ?? [])
      .filter((c) => c.status === "approved" || c.status === "pending")
      .map((c) => c.profile_id),
  );
  // Somebody already excluded stays listed even once settled, or there
  // would be no way to put them back.
  const excludable = members.filter((m) => !settled.has(m.id) || excluded.has(m.id));
  const hiddenCount = members.length - excludable.length;

  function update<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSampleError(null);
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      deadline: form.deadline || null,
      assign_to: form.assign_to,
      blocker_days_before: form.deadline ? Number(form.blocker_days_before) || 0 : 0,
      requires_approval: form.requires_approval,
      requires_photo: form.requires_photo,
      requires_completion_date: form.requires_completion_date,
      blocks_schedule: form.blocks_schedule,
      blocks_leave: form.blocks_leave,
      // Only meaningful on an "all members" task — an individually assigned
      // one is removed by reassigning it, not by excusing the assignee.
      excluded_ids: form.assign_to === "all" ? [...excluded] : [],
    };

    if (isEdit) {
      payload.id = editTask!.id;
      // Which stored samples survived this edit. Sent on every edit, not
      // only when one was removed — it is the whole list the task should
      // keep, so leaving it out on a plain title change would be read as
      // "no change" and leaving it out on a removal would silently undo it.
      payload.sample_photo_paths = keptSamples.map((s) => s.path);
    }

    try {
      let res: Response;
      if (newSamples.length > 0) {
        // A phone photo is 3–8MB and the platform refuses a request body
        // over ~4.5MB before this route ever runs — which came back as a
        // failure with no message at all. Re-encode them to fit one request.
        setPreparing(true);
        const { files, error: tooBig } = await shrinkImagesForUpload(newSamples.map((p) => p.file));
        setPreparing(false);
        if (tooBig) {
          setSampleError(tooBig);
          setSubmitting(false);
          return;
        }

        // The rest of the form is too structured to flatten into form
        // fields, so it rides along whole as one JSON blob beside the files.
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        for (const f of files) fd.append("sample_photo", f);
        res = await fetch("/api/tasks", { method: isEdit ? "PATCH" : "POST", body: fd });
      } else {
        res = await fetch("/api/tasks", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setSubmitting(false);

      if (!res.ok) {
        setError(await readUploadError(res, "Something went wrong."));
        return;
      }

      onClose();
      router.refresh();
    } catch {
      // A dropped connection rejects the fetch outright. Unhandled, that
      // left the button spinning with nothing to read.
      setPreparing(false);
      setSubmitting(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  return (
    <Modal size="lg" onClose={onClose} title={isEdit ? "Edit task" : "Add task"}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Title" value={form.title} onChange={(v) => update("title", v)} />
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm resize-y"
            />
          </div>
          <Section title="Who it's for">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Assign to
            </label>
            <select
              value={form.assign_to}
              onChange={(e) => update("assign_to", e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
            >
              <option value="all">All Members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Excusing people from an "all members" task. Assigning to
              everyone and then finding some of them had already done it used
              to have no expression: the choice was to keep chasing them for
              finished work, or delete the task and lose every other
              submission with it. Excused members are not assigned it, not
              blocked by it, and cannot be nudged about it. */}
          {form.assign_to === "all" && excludable.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Exclude members (optional)
              </label>
              <p className="text-[11.5px] text-[var(--muted)] m-0 mb-2 leading-snug">
                Tap anyone who does not need to do this — already done it, or it does not apply to them.
                {excluded.size > 0 && (
                  <span className="text-[var(--ink)] font-semibold"> {excluded.size} excluded.</span>
                )}
                {hiddenCount > 0 && (
                  <span className="block mt-0.5">
                    {hiddenCount} {hiddenCount === 1 ? "person has" : "people have"} already submitted and{" "}
                    {hiddenCount === 1 ? "is" : "are"} not listed.
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-[132px] overflow-y-auto p-1 -m-1">
                {excludable.map((m) => {
                  const off = excluded.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={off}
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className={`px-2 py-1 rounded-full text-[11.5px] font-semibold border transition-colors cursor-pointer ${
                        off
                          ? "border-[var(--bad)] text-[var(--bad)] line-through opacity-70"
                          : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {m.first_name} {m.last_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </Section>

          {/* Deadline, when blocking starts, and what it locks are one
              subject and now read as one. Loose in the form, the lock
              checkboxes sat directly above the submission ones with nothing
              between them, so "Require my approval" looked like a third
              thing this task locks. */}
          <Section title="Deadline & blocking">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => update("deadline", e.target.value)}
                  className="w-full px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
                />
              </div>
              {form.deadline && (
                <Field
                  label="Start blocking (days before)"
                  value={form.blocker_days_before}
                  onChange={(v) => update("blocker_days_before", v)}
                  type="number"
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                While blocking, lock
              </span>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.blocks_schedule}
                  onChange={(e) => update("blocks_schedule", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer"
                />
                <span className="text-[13px] text-[var(--ink)] leading-snug">
                  Schedule viewing
                  <span className="block text-[11.5px] text-[var(--muted)]">
                    Future dates on Weekly Schedule, and tomorrow&apos;s station on their Dashboard. Today stays
                    visible either way.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.blocks_leave}
                  onChange={(e) => update("blocks_leave", e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer"
                />
                <span className="text-[13px] text-[var(--ink)] leading-snug">
                  Filing a leave request
                </span>
              </label>
              {!form.blocks_schedule && !form.blocks_leave && (
                <p className="text-[11.5px] text-[var(--muted)] m-0 leading-snug">
                  Nothing is locked — members still see the task, and you can still nudge them, but it will not
                  hold anything up.
                </p>
              )}
            </div>
          </Section>

          <Section title="What the member must do">
            <div className="flex flex-col gap-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(e) => update("requires_approval", e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12.5px] leading-snug">
                <span className="font-semibold text-[var(--ink)]">Require my approval</span>
                <span className="block text-[var(--muted)]">
                  Submissions wait for you to approve. Unchecked, the task clears the moment the member
                  marks it done.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_completion_date}
                onChange={(e) => update("requires_completion_date", e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12.5px] leading-snug">
                <span className="font-semibold text-[var(--ink)]">Require a completion date</span>
                <span className="block text-[var(--muted)]">
                  The member picks the date they actually did it, which can be earlier than the day they
                  submit.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_photo}
                onChange={(e) => update("requires_photo", e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[12.5px] leading-snug">
                <span className="font-semibold text-[var(--ink)]">Require a photo as proof</span>
                <span className="block text-[var(--muted)]">
                  The member must attach an image before they can submit.
                </span>
              </span>
            </label>

            {/* The guide for that photo. Requiring proof without showing what
                proof looks like is what filled the review queue with the
                right work photographed the wrong way — a screen instead of
                the logbook, the whole room instead of the counter. Nested
                under the checkbox it belongs to, and still shown when the
                requirement is switched off so samples already attached can
                be seen and removed rather than quietly hanging on. */}
            {(form.requires_photo || sampleCount > 0) && (
              <div className="ml-[26px] pl-3 border-l-2 border-[var(--line)] flex flex-col gap-1.5">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Sample photo (optional)
                </span>
                <p className="text-[11.5px] text-[var(--muted)] m-0 leading-snug">
                  Attach up to {MAX_SAMPLE_PHOTOS} examples of what a good proof looks like. Everyone the task is
                  for sees them on the task, right where they attach their own.
                </p>

                <input
                  ref={sampleInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    chooseSamples(e.target.files);
                    // Cleared, or picking the same file twice running is a
                    // no-op because the input's value never changed.
                    e.target.value = "";
                  }}
                />

                {sampleCount > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {keptSamples.map((sample, i) => (
                      <div key={sample.path} className="relative w-16 h-16 shrink-0">
                        {sample.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sample.url}
                            alt={`Sample ${i + 1}`}
                            className="w-full h-full rounded-md object-cover border border-[var(--line)]"
                          />
                        ) : (
                          // Still attached, just not previewable right now —
                          // saying so beats a broken image, and leaving it
                          // listed keeps it on the task.
                          <div className="w-full h-full rounded-md border border-[var(--line)] bg-[var(--paper)] flex items-center justify-center text-center text-[9.5px] leading-tight text-[var(--muted)] px-1">
                            No preview
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setKeptSamples((prev) => prev.filter((k) => k.path !== sample.path))}
                          disabled={submitting}
                          aria-label={`Remove sample ${i + 1}`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/75 text-white text-[12px] leading-none flex items-center justify-center hover:bg-black cursor-pointer disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {newSamples.map((picked, i) => (
                      <div key={picked.url} className="relative w-16 h-16 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={picked.url}
                          alt={picked.file.name}
                          className="w-full h-full rounded-md object-cover border border-[var(--line)]"
                        />
                        <button
                          type="button"
                          onClick={() => removeNewSample(i)}
                          disabled={submitting}
                          aria-label={`Remove ${picked.file.name}`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/75 text-white text-[12px] leading-none flex items-center justify-center hover:bg-black cursor-pointer disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => sampleInputRef.current?.click()}
                  disabled={submitting || sampleCount >= MAX_SAMPLE_PHOTOS}
                  className="self-start inline-flex items-center gap-1.5 mt-0.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[var(--line)] text-[var(--accent-strong)] hover:border-[var(--accent)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  {sampleCount === 0
                    ? "Add sample photo"
                    : `Add more (${sampleCount}/${MAX_SAMPLE_PHOTOS})`}
                </button>

                {sampleError && (
                  <p role="alert" className="text-[11.5px] text-[var(--bad)] m-0">
                    {sampleError}
                  </p>
                )}
              </div>
            )}
            </div>
          </Section>

          {error && (
            <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 mt-1">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {preparing
                ? "Preparing photos…"
                : submitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create task"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}

// A titled, boxed group. The form is a long column of controls with no
// hierarchy otherwise, and two runs of checkboxes back to back read as one
// list — which is how "Require my approval" ended up looking like something
// the task locks.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/40 px-3.5 py-3 m-0 flex flex-col gap-3">
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        required={type !== "number"}
        min={type === "number" ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded-md border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] text-sm"
      />
    </div>
  );
}

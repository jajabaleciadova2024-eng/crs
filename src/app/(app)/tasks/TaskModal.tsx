"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

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

  function update<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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

    if (isEdit) payload.id = editTask!.id;

    const res = await fetch("/api/tasks", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start justify-center px-4 py-6 z-50 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl w-full max-w-xl p-5 sm:p-6 animate-scale-in my-auto"
        style={{ boxShadow: "var(--shadow-lg, 0 10px 25px rgba(0,0,0,.1))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold mb-4">{isEdit ? "Edit task" : "Add task"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Title" value={form.title} onChange={(v) => update("title", v)} />
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm resize-y"
            />
          </div>
          <Section title="Who it's for">
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Assign to
            </label>
            <select
              value={form.assign_to}
              onChange={(e) => update("assign_to", e.target.value)}
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
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
          {form.assign_to === "all" && members.length > 0 && (
            <div>
              <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Exclude members (optional)
              </label>
              <p className="text-[11.5px] text-[var(--muted)] m-0 mb-2 leading-snug">
                Tap anyone who does not need to do this — already done it, or it does not apply to them.
                {excluded.size > 0 && (
                  <span className="text-[var(--ink)] font-semibold"> {excluded.size} excluded.</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-[132px] overflow-y-auto p-1 -m-1">
                {members.map((m) => {
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
                <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => update("deadline", e.target.value)}
                  className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
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
              <span className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
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
            </div>
          </Section>

          {error && (
            <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// A titled, boxed group. The form is a long column of controls with no
// hierarchy otherwise, and two runs of checkboxes back to back read as one
// list — which is how "Require my approval" ended up looking like something
// the task locks.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-[var(--line)] bg-[var(--paper)]/40 px-3.5 py-3 m-0 flex flex-col gap-3">
      <legend className="px-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--accent-strong)]">
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
      <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        required={type !== "number"}
        min={type === "number" ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
      />
    </div>
  );
}

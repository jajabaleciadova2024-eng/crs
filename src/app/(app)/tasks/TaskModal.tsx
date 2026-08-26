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
}

const EMPTY: TaskForm = {
  title: "",
  description: "",
  deadline: "",
  assign_to: "all",
  blocker_days_before: "0",
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
        }
      : EMPTY,
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
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-xl w-full max-w-md p-5 animate-scale-in"
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
              label="Block schedule viewing X days before deadline"
              value={form.blocker_days_before}
              onChange={(v) => update("blocker_days_before", v)}
              type="number"
            />
          )}

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

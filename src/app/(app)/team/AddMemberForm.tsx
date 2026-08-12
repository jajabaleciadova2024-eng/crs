"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { AppRole } from "@/lib/database.types";

const EMPTY = {
  psid: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  mobile_number: "",
  role: "associate" as AppRole,
};

export default function AddMemberForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add that member.");
      return;
    }

    setForm(EMPTY);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Add member
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-10 px-4">
      <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md w-full max-w-md p-5">
        <h2 className="text-sm font-bold mb-4">Add member</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="PSID" value={form.psid} onChange={(v) => update("psid", v)} />
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value as AppRole)}
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
            >
              <option value="associate">Associate</option>
              <option value="oic">OIC</option>
              <option value="team_leader">Team Leader</option>
            </select>
          </Field>
          <Field label="First name" value={form.first_name} onChange={(v) => update("first_name", v)} />
          <Field label="Middle name (optional)" value={form.middle_name} onChange={(v) => update("middle_name", v)} required={false} />
          <Field label="Last name" value={form.last_name} onChange={(v) => update("last_name", v)} />
          <Field label="Mobile number" value={form.mobile_number} onChange={(v) => update("mobile_number", v)} required={false} />
          <div className="col-span-2">
            <Field label="Email address" value={form.email} onChange={(v) => update("email", v)} type="email" />
          </div>

          {error && (
            <p role="alert" className="col-span-2 text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              {error}
            </p>
          )}

          <p className="col-span-2 text-xs text-[var(--muted)]">
            They&rsquo;ll receive an email invite to set their own password.
          </p>

          <div className="col-span-2 flex justify-end gap-2 mt-1">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Adding…" : "Add member"}
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
  required = true,
  children,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">{label}</label>
      {children ?? (
        <input
          type={type}
          value={value}
          required={required}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
        />
      )}
    </div>
  );
}

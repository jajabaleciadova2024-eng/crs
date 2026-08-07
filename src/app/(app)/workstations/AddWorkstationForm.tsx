"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function AddWorkstationForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Station name is required.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("workstations").insert({
      name: name.trim(),
      description: description.trim() || null,
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message.includes("duplicate") ? "A station with that name already exists." : "Couldn't add that station.");
      return;
    }

    setName("");
    setDescription("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Add station
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-10 px-4">
      <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-md w-full max-w-sm p-5">
        <h2 className="text-sm font-bold mb-4">Add workstation</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1.5">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Adding…" : "Add station"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

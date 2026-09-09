"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button } from "@/components/ui";

export default function DeleteLeaveButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await fetch(`/api/leave/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't delete that request.");
        return;
      }
      setOpen(false);
      setError(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        aria-label={`Delete leave request for ${label}`}
        className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--bad)]/10 transition-colors cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6l-1.5 14a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Delete leave record?">
        <p className="text-sm text-[var(--muted)] mt-0 mb-4">
          This will permanently remove <strong>{label}</strong>&apos;s leave record. This cannot be undone.
        </p>
        {error && (
          <div className="text-sm text-[var(--bad)] bg-[var(--bad)]/10 border border-[var(--bad)]/20 rounded-md px-3 py-2 mb-3">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={confirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

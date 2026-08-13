"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function ClearScheduleButton({ scheduleWeekId, weekStart }: { scheduleWeekId: string; weekStart: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function clear() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/schedule/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule_week_id: scheduleWeekId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? `Couldn't clear the schedule (server responded ${res.status}).`);
          return;
        }
        setConfirming(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? `Couldn't reach the server: ${err.message}` : "Couldn't reach the server.");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setConfirming(true)}>Clear schedule</Button>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fade-in" onClick={() => setConfirming(false)}>
          <div
            className="w-full max-w-sm bg-[var(--paper-raised)] border border-[var(--line)] rounded-lg p-6 flex flex-col gap-3 animate-scale-in"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-[var(--ink)] m-0">Clear this week&apos;s schedule?</h2>
            <p className="text-sm text-[var(--muted)] m-0">
              This permanently deletes every station assignment generated for the week of{" "}
              <strong className="text-[var(--ink)]">{weekStart}</strong>. This can&apos;t be undone — you&apos;ll need
              to generate it again from scratch.
            </p>

            {error && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{error}</p>}

            <div className="flex justify-end gap-2 mt-1">
              <Button style={{ padding: "7px 14px" }} disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ padding: "7px 14px", background: "var(--bad)", borderColor: "var(--bad)" }}
                disabled={pending}
                onClick={clear}
              >
                {pending ? "Clearing…" : "Yes, clear it"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

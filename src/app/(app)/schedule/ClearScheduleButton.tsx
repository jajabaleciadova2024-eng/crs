"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "@/components/ui";

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
        <Modal
          onClose={() => setConfirming(false)}
          title="Clear this week's schedule?"
          size="sm"
          footer={
            <>
              <Button disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={pending}
                disabled={pending}
                onClick={clear}
              >
                {pending ? "Clearing…" : "Yes, clear it"}
              </Button>
            </>
          }
        >
            <p className="text-sm text-[var(--muted)] m-0">
              This permanently deletes every station assignment generated for the week of{" "}
              <strong className="text-[var(--ink)]">{weekStart}</strong>. This can&apos;t be undone — you&apos;ll need
              to generate it again from scratch.
            </p>

            {error && <p className="text-sm text-[var(--bad)] bg-[var(--bad-soft)] rounded px-3 py-2 m-0">{error}</p>}

        </Modal>
      )}
    </>
  );
}

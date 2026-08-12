"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function GenerateButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/schedule/generate", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't generate the schedule.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-[var(--bad)]">{error}</span>}
      <Button variant="primary" disabled={pending} onClick={generate}>
        {pending ? "Generating…" : "Generate next week"}
      </Button>
    </div>
  );
}

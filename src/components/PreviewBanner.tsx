"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PreviewBanner({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function exitPreview() {
    startTransition(async () => {
      await fetch("/api/preview-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "team_leader" }),
      });
      router.refresh();
    });
  }

  return (
    <div className="sticky top-0 z-10 -mx-4 md:-mx-8 -mt-5 md:-mt-7 mb-6 px-4 md:px-8 py-2 bg-[var(--warn)] text-white text-[12.5px] font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-0">
      <span>Previewing as {label} — the app is showing exactly what this role would see.</span>
      <button
        type="button"
        onClick={exitPreview}
        disabled={pending}
        className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 font-bold disabled:opacity-50"
      >
        {pending ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}

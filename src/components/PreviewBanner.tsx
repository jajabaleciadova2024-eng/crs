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

  const content = (
    <>
      <span>Previewing as {label} — the app is showing exactly what this role would see.</span>
      <button
        type="button"
        onClick={exitPreview}
        disabled={pending}
        className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 font-bold disabled:opacity-50"
      >
        {pending ? "Exiting…" : "Exit preview"}
      </button>
    </>
  );

  // Fixed, not sticky — same reasoning as PageHeader/Sidebar (sticky was
  // unreliable in this app's layout). Sits above PageHeader in the DOM
  // (rendered first inside <main>), so PageHeader shifts down to make
  // room for it via --preview-offset, set on <main> by the layout while
  // previewing is active — see (app)/layout.tsx.
  return (
    <>
      <div aria-hidden="true" className="invisible px-4 md:px-10 py-2 mb-6 flex flex-col sm:flex-row gap-1.5 sm:gap-0 text-[12.5px]">
        {content}
      </div>
      <div className="fixed z-[25] top-14 md:top-0 left-0 md:left-[var(--sidebar-width,220px)] w-full md:w-[calc(100%-var(--sidebar-width,220px))] px-4 md:px-10 py-2 bg-[var(--warn)] text-white text-[12.5px] font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-0 transition-[left,width] duration-200 ease-out">
        {content}
      </div>
    </>
  );
}

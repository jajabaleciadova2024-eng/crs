"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PostComposer from "./PostComposer";
import type { Mentionable } from "./mentions";

// Facebook-style composer trigger next to the dashboard greeting. Clicking
// it opens the SAME PostComposer used on the feed in a modal, so posting
// never navigates away or scroll-jumps the page.
export default function QuickPostButton({ mentionable }: { mentionable: Mentionable[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSubmit(content: string, imageUrl?: string | null) {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, image_url: imageUrl || null }),
    });
    if (!res.ok) return;
    setOpen(false);
    // Refresh so the new post appears in the dashboard's feed panel below.
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Write a post"
        className="flex items-center gap-2 flex-1 min-w-0 max-w-[320px] text-left px-4 py-2 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] text-[13px] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span className="truncate">What&apos;s on your mind?</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start justify-center z-50 px-4 py-10 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--paper)] border border-[var(--line)] rounded-xl w-full max-w-lg p-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-[var(--ink)]">Create a post</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <PostComposer onSubmit={handleSubmit} mentionable={mentionable} />
          </div>
        </div>
      )}
    </>
  );
}

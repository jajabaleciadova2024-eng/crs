"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import PostComposer from "./PostComposer";
import type { Mentionable } from "./mentions";

// Facebook-style composer trigger next to the dashboard greeting. Clicking
// it opens the SAME PostComposer used on the feed in a modal, so posting
// never navigates away or scroll-jumps the page.
export default function QuickPostButton({ mentionable }: { mentionable: Mentionable[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

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

  // Rendered through a portal into <body>: the dashboard PageHeader is
  // `fixed` WITH `backdrop-blur`, and both establish a stacking context —
  // so a modal rendered inline here would be trapped inside the header
  // band instead of covering the viewport, however high its z-index.
  // Modal handles Escape, backdrop click and the body scroll lock.
  const modal = (
    <Modal size="md" zIndex={100} onClose={() => setOpen(false)} title="Create a post">
      <PostComposer onSubmit={handleSubmit} mentionable={mentionable} />
    </Modal>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Write a post"
        className="flex items-center gap-2 flex-1 min-w-[180px] max-w-[320px] text-left px-4 py-2 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] text-[13px] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span className="truncate">What&apos;s on your mind?</span>
      </button>

      {open && mounted && createPortal(modal, document.body)}
    </>
  );
}

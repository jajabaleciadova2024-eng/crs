"use client";

// Facebook-style composer trigger next to the dashboard greeting — clicking
// it scrolls to the real "What's on your mind?" composer and focuses it, so
// posting doesn't require scrolling past the stat cards first.
export default function QuickPostButton() {
  function handleClick() {
    const el = document.getElementById("whats-on-your-mind");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Wait for the smooth-scroll to roughly finish before focusing —
    // focusing mid-scroll can yank the viewport back to the input.
    const textarea = el.querySelector("textarea");
    window.setTimeout(() => textarea?.focus(), 450);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
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
  );
}

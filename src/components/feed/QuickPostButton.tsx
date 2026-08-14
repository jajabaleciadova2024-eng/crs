"use client";

// Small pencil-icon shortcut next to the dashboard greeting — scrolls
// straight to the "What's on your mind?" composer and focuses it, so
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
      title="Write a post"
      className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)] hover:-translate-y-[1px] transition-all duration-150 shrink-0"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

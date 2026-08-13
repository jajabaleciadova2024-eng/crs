// Instant loading state for every page inside the authenticated app shell
// (dashboard, leave, schedule, team, etc.) — Next.js automatically shows
// this the moment a navigation starts, wrapped around the target page while
// its data loads, and swaps it out once the page is ready. The sidebar
// (defined in layout.tsx, outside this boundary) stays put and interactive,
// so only the content area shows the spinner — that's the visual cue that
// tells someone they're moving to a different page.
export default function AppLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-[var(--accent)] animate-spin"
          role="status"
          aria-label="Loading"
        />
        <span className="text-xs text-[var(--muted)]">Loading…</span>
      </div>
    </div>
  );
}

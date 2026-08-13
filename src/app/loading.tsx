// Fallback loading state for routes outside the authenticated app shell
// (login, forgot-password, reset-password) — see src/app/(app)/loading.tsx
// for the themed one shown while navigating between app pages.
export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen animate-fade-in">
      <div
        className="w-9 h-9 rounded-full border-[2.5px] border-[var(--line)] border-t-[var(--accent)] animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

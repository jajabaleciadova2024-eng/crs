"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Wraps the (server-rendered) Sidebar content. On mobile it becomes a
// hamburger-triggered slide-in drawer with a backdrop; on desktop (md+)
// it's the normal static sidebar, unchanged from before. Sidebar itself
// stays a server component — this only adds positioning/toggle behavior
// around it.
export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation — the layout (and this shell) persists
  // across route changes in the App Router, so it wouldn't otherwise close
  // itself just because a nav link was clicked.
  useEffect(() => {
    // Legitimate "synchronize with an external system" effect (the route),
    // not a state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div
        className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-[var(--line)] bg-[var(--paper)]"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <span className="font-serif text-[17px] font-bold text-[var(--ink)] tracking-tight">CRS Naga</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -mr-2 text-[var(--ink)] rounded-md hover:bg-[var(--accent-soft)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed md:sticky top-0 left-0 h-screen z-50 md:z-auto transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {children}
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const COLLAPSE_KEY = "crs_sidebar_collapsed";

// Wraps the (server-rendered) Sidebar content. On mobile it becomes a
// hamburger-triggered slide-in drawer with a backdrop (always full width —
// the collapse/pin feature below is a desktop concept); on desktop (md+)
// it's the normal sticky sidebar, plus a collapse/pin toggle that narrows
// it to an icon-only rail. Sidebar itself stays a server component — this
// only adds positioning/toggle behavior around it. The collapsed state is
// applied as a `data-collapsed` attribute on the wrapping `group/sidebar`
// element; Sidebar's own markup (and NavLink) key off that via Tailwind's
// `group-data-[collapsed=true]/sidebar:*` variant, so no prop drilling or
// context is needed to reach into server-rendered children.
export default function SidebarShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Restore the pinned/collapsed preference after mount — reading
  // localStorage during render would mismatch the server-rendered HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  // Close the mobile drawer on navigation — the layout (and this shell)
  // persists across route changes in the App Router, so it wouldn't
  // otherwise close itself just because a nav link was clicked.
  useEffect(() => {
    // Legitimate "synchronize with an external system" effect (the route),
    // not a state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

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

      {/* Sticky on desktop (md:sticky + h-screen) so the sidebar stays
          pinned in the viewport as the main content scrolls; a fixed
          slide-in drawer on mobile instead. */}
      <div
        className={`fixed md:sticky top-0 left-0 h-screen z-50 md:z-auto transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div
          className={`group/sidebar relative h-full border-r border-[var(--line)] bg-[var(--paper)] transition-[width] duration-200 ease-out w-[220px] ${
            collapsed ? "md:w-[72px]" : "md:w-[220px]"
          }`}
          data-collapsed={collapsed ? "true" : "false"}
        >
          {children}

          {/* Collapse/pin handle — desktop only, floats on the sidebar's
              right edge like a standard IDE/editor collapse control. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            className="hidden md:flex absolute -right-3 top-9 w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] items-center justify-center text-[var(--muted)] hover:text-[var(--accent-strong)] hover:border-[var(--accent)] z-10"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

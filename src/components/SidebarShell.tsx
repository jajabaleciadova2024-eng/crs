"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const COLLAPSE_KEY = "crs_sidebar_collapsed";

// Wraps the (server-rendered) Sidebar content. On mobile it becomes a
// hamburger-triggered slide-in drawer with a backdrop (always full width —
// the collapse/pin feature below is a desktop concept); on desktop (md+)
// it's a permanently `position: fixed` rail, plus a collapse/pin toggle
// that narrows it to an icon-only rail. Sidebar itself stays a server
// component — this only adds positioning/toggle behavior around it.
//
// Deliberately `fixed`, not `sticky`, at every breakpoint: this sidebar
// sits inside a `flex md:flex-row` container alongside a `<main>` that can
// be much taller than the viewport, and that specific combination (a
// flex item with an explicit `h-screen` using `position: sticky`) turned
// out to make Chrome/Firefox miscompute the flex container's own height,
// which cascaded into breaking even unrelated `position: sticky` elements
// further down inside `<main>` (e.g. PageHeader). `fixed` has none of
// that containing-block ambiguity — it's always pinned to the viewport,
// full stop. Removing it from flow like this means `<main>` needs an
// explicit left margin to avoid sitting underneath it (see
// `--sidebar-width` below, consumed by `main`'s `md:ml-[var(--sidebar-width,220px)]`
// in the app layout).
//
// The collapsed state is applied as a `data-collapsed` attribute on the
// wrapping `group/sidebar` element; Sidebar's own markup (and NavLink) key
// off that via Tailwind's `group-data-[collapsed=true]/sidebar:*` variant,
// so no prop drilling or context is needed to reach into server-rendered
// children.
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

  // Keep --sidebar-width in sync so <main> (a sibling outside this
  // component's own DOM subtree) can offset itself without prop drilling
  // or context — see the big comment above for why margin instead of a
  // sticky/flex-based approach.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", collapsed ? "72px" : "220px");
  }, [collapsed]);

  // Close the mobile drawer on navigation — the layout (and this shell)
  // persists across route changes in the App Router, so it wouldn't
  // otherwise close itself just because a nav link was clicked.
  useEffect(() => {
    // Legitimate "synchronize with an external system" effect (the route),
    // not a state cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Escape closes the mobile drawer + prevent background scroll while
  // it's open (standard mobile-drawer/modal etiquette).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      {/* Mobile top bar — position:fixed, not sticky (same reasoning as
          the sidebar and PageHeader above: sticky was empirically
          unreliable in this app's layout, "moving"/scrolling out of view
          when it shouldn't). Being fixed pulls it out of normal flow, so
          an invisible spacer directly below reserves its height so page
          content doesn't jump up underneath it. Blurred + slightly
          translucent so content peeking through underneath reads as
          "there's more above" rather than a flat wall. */}
      <div aria-hidden="true" className="md:hidden flex items-center justify-between h-14 px-4 invisible">
        <span className="font-serif text-[17px] font-bold tracking-tight">CRS Naga</span>
        <span className="inline-flex w-10 h-10" />
      </div>
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between h-14 px-4 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur-md">
        <span className="font-serif text-[17px] font-bold text-[var(--ink)] tracking-tight">CRS Naga</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="inline-flex items-center justify-center w-10 h-10 -mr-2 text-[var(--ink)] rounded-lg hover:bg-[var(--accent-soft)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Always position:fixed (see the top-of-file comment for why not
          sticky) — pinned to the viewport at every breakpoint. The mobile
          slide-in/out transform is scoped with `max-md:` so no transform
          utility is ever generated for this element at md+ at all — a
          transform on the SAME element as certain position values can
          introduce its own containing-block quirks, so it's simplest to
          just never apply one past mobile. */}
      <div
        className={`fixed top-0 left-0 h-[100dvh] z-50 transition-transform duration-250 ease-out will-change-transform ${
          open ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        }`}
      >
        <div
          className={`group/sidebar relative h-full border-r border-[var(--line)] bg-[var(--paper)] transition-[width] duration-200 ease-out w-[264px] max-md:shadow-2xl md:w-[220px] ${
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
            className="hidden md:flex absolute -right-3 top-9 w-6 h-6 rounded-full bg-[var(--paper-raised)] border border-[var(--line)] items-center justify-center text-[var(--muted)] hover:text-[var(--accent-strong)] hover:border-[var(--accent)] hover:scale-110 z-10"
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

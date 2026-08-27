"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Client component so it can read the current route for active-state
// highlighting — Sidebar itself stays a server component (it doesn't
// re-render on client-side navigation between sibling routes under the
// same layout, so it can't know "current page" on its own). The icon is
// rendered server-side in Sidebar.tsx and passed in as a prop — plain,
// non-interactive JSX can cross the server→client boundary as children.
export default function NavLink({
  href,
  label,
  icon,
  badgeCount,
  exact = false,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  badgeCount: number;
  // Exact-match only — for a parent route that has its own sibling nav
  // entries underneath it (e.g. /leave vs /leave/calendar), so both don't
  // light up at once.
  exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive =
    href === "/" || exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={label}
      className={`group/link relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 md:group-data-[collapsed=true]/sidebar:justify-center md:group-data-[collapsed=true]/sidebar:px-0 ${
        isActive
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--accent-soft)]/60 hover:text-[var(--ink)] active:bg-[var(--accent-soft)]/80"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--accent)] md:group-data-[collapsed=true]/sidebar:hidden" />
      )}
      <span
        className={`transition-colors ${
          isActive
            ? "text-[var(--accent-strong)]"
            : "text-[var(--muted)] md:group-data-[collapsed=false]/sidebar:group-hover/link:text-[var(--accent-strong)]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 truncate md:group-data-[collapsed=true]/sidebar:hidden">{label}</span>
      {badgeCount > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[19px] h-[19px] px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold tabular-nums md:group-data-[collapsed=true]/sidebar:absolute md:group-data-[collapsed=true]/sidebar:-top-1 md:group-data-[collapsed=true]/sidebar:-right-1 md:group-data-[collapsed=true]/sidebar:min-w-[16px] md:group-data-[collapsed=true]/sidebar:h-[16px] md:group-data-[collapsed=true]/sidebar:text-[9px] md:group-data-[collapsed=true]/sidebar:px-0 md:group-data-[collapsed=true]/sidebar:ring-2 md:group-data-[collapsed=true]/sidebar:ring-[var(--paper)]"
          style={{ boxShadow: "var(--shadow-xs)" }}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

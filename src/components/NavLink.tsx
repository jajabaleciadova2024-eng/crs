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
}: {
  href: string;
  label: string;
  icon: ReactNode;
  badgeCount: number;
}) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={label}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-semibold transition-colors group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0 ${
        isActive
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--accent-soft)]/70 hover:text-[var(--ink)]"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] group-data-[collapsed=true]/sidebar:hidden" />
      )}
      <span className={isActive ? "text-[var(--accent-strong)]" : "text-[var(--muted)] group-data-[collapsed=false]/sidebar:group-hover:text-[var(--ink)]"}>
        {icon}
      </span>
      <span className="flex-1 truncate group-data-[collapsed=true]/sidebar:hidden">{label}</span>
      {badgeCount > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[19px] h-[19px] px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold group-data-[collapsed=true]/sidebar:absolute group-data-[collapsed=true]/sidebar:-top-1 group-data-[collapsed=true]/sidebar:-right-1 group-data-[collapsed=true]/sidebar:min-w-[16px] group-data-[collapsed=true]/sidebar:h-[16px] group-data-[collapsed=true]/sidebar:text-[9px] group-data-[collapsed=true]/sidebar:px-0"
          style={{ boxShadow: "var(--shadow-xs)" }}
        >
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

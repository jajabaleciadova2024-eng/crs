import Link from "next/link";
import type { AppRole, Profile } from "@/lib/database.types";
import { ROLE_LABEL } from "@/lib/auth";
import { formatFullName } from "@/lib/format";
import SignOutButton from "@/components/SignOutButton";
import PreviewRoleSwitcher from "@/components/PreviewRoleSwitcher";

type NavItem = { href: string; label: string; roles?: Profile["role"][]; badgeKey?: "accessRequests" | "pendingLeave" };

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/schedule", label: "Weekly Schedule" },
  { href: "/leave", label: "Leave Requests", badgeKey: "pendingLeave" },
  { href: "/team", label: "Team & Roles", roles: ["team_leader"] },
  { href: "/access-requests", label: "Access Requests", roles: ["team_leader"], badgeKey: "accessRequests" },
  { href: "/workstations", label: "Workstations", roles: ["team_leader"] },
];

// Settings + User Guide live at the bottom of the sidebar, just above the
// signed-in user row, separate from the main app navigation above.
const BOTTOM_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "User Guide" },
];

function NavLink({ item, badgeCount }: { item: NavItem; badgeCount: number }) {
  return (
    <Link
      href={item.href}
      className="px-3 py-2 rounded-md text-[13px] font-semibold text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)] flex items-center justify-between transition-colors"
    >
      {item.label}
      {badgeCount > 0 && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold" style={{ boxShadow: "var(--shadow-xs)" }}>
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({
  profile,
  pendingAccessRequests = 0,
  pendingLeaveRequests = 0,
  realRole,
}: {
  profile: Profile;
  pendingAccessRequests?: number;
  pendingLeaveRequests?: number;
  realRole?: AppRole;
}) {
  return (
    <aside className="border-r border-[var(--line)] px-4 py-6 flex flex-col gap-6 h-full w-[220px] overflow-y-auto shrink-0 bg-[var(--paper)]">
      <div>
        <div className="font-serif text-[18px] font-bold text-[var(--ink)] tracking-tight">CRS Naga</div>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mt-0.5">
          Field Operations
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(profile.role)).map((item) => {
          const badgeCount =
            item.badgeKey === "accessRequests" ? pendingAccessRequests : item.badgeKey === "pendingLeave" ? pendingLeaveRequests : 0;
          return <NavLink key={item.href} item={item} badgeCount={badgeCount} />;
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {realRole === "team_leader" && <PreviewRoleSwitcher currentRole={profile.role} />}

        <nav className="flex flex-col gap-0.5">
          {BOTTOM_NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} badgeCount={0} />
          ))}
        </nav>
      </div>

      <div className="border-t border-[var(--line)] pt-4 flex items-center gap-2.5">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover ring-1 ring-[var(--accent-soft)] shrink-0"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-[var(--accent-soft)]">
            {`${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--ink)] truncate">
            {formatFullName(profile.first_name, profile.last_name)}
          </div>
          <div className="text-[10.5px] text-[var(--muted)]">{ROLE_LABEL[profile.role]}</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

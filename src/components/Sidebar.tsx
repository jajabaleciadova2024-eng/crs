import type { ReactNode } from "react";
import type { AppRole, Profile } from "@/lib/database.types";
import { ROLE_LABEL } from "@/lib/auth";
import { formatFullName } from "@/lib/format";
import SignOutButton from "@/components/SignOutButton";
import PreviewRoleSwitcher from "@/components/PreviewRoleSwitcher";
import NavLink from "@/components/NavLink";
import NavGroup from "@/components/NavGroup";

type NavItem = {
  href: string;
  label: string;
  roles?: Profile["role"][];
  badgeKey?: "accessRequests" | "pendingLeave" | "pendingTasks" | "accountAlerts";
  icon: ReactNode;
  // Highlight only on an exact path match — see NavLink's `exact` prop.
  exact?: boolean;
};

// Small stroke-icon helper — self-contained (no icon library), consistent
// 18px/1.8-stroke look across every nav item.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

// --- Top-level items (always visible, no group) ---
const TOP_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <Icon>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </Icon>
    ),
  },
  {
    href: "/schedule",
    label: "Weekly Schedule",
    exact: true,
    icon: (
      <Icon>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v4M16 3v4" />
      </Icon>
    ),
  },
  {
    href: "/breaks",
    label: "Break Schedule",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </Icon>
    ),
  },
];

// --- Community group ---
const COMMUNITY_ITEMS: NavItem[] = [
  {
    href: "/feed",
    label: "Team Feed",
    icon: (
      <Icon>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </Icon>
    ),
  },
  {
    href: "/announcements",
    label: "Announcements",
    icon: (
      <Icon>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </Icon>
    ),
  },
];

// --- Requests & Tasks group ---
const REQUESTS_ITEMS: NavItem[] = [
  {
    href: "/leave",
    label: "Leave Requests",
    badgeKey: "pendingLeave",
    exact: true,
    icon: (
      <Icon>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
        <path d="M8.5 12h7M8.5 15.5h5" />
      </Icon>
    ),
  },
  {
    href: "/tasks",
    label: "Members Tasks",
    badgeKey: "pendingTasks",
    // /tasks/report is its own nav row — without this both light up.
    exact: true,
    icon: (
      <Icon>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </Icon>
    ),
  },
  {
    href: "/leave/calendar",
    label: "Leave Calendar",
    icon: (
      <Icon>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v4M16 3v4" />
        <path d="M8.5 14h2M13.5 14h2M8.5 17.5h2" />
      </Icon>
    ),
  },
  {
    href: "/concerns",
    label: "Concerns",
    icon: (
      <Icon>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </Icon>
    ),
  },
  {
    href: "/access-requests",
    label: "Access Requests",
    roles: ["team_leader"],
    badgeKey: "accessRequests",
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M17 8v6M20 11h-6" />
      </Icon>
    ),
  },
];

// --- Management group (TL only) ---
const MANAGEMENT_ITEMS: NavItem[] = [
  {
    href: "/team",
    label: "Team & Roles",
    roles: ["team_leader"],
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="8.5" r="2.3" />
        <path d="M15.6 12.2c2.6.3 4.6 2.3 4.9 5" />
      </Icon>
    ),
  },
  {
    href: "/schedule/history",
    label: "Assignment History",
    roles: ["team_leader", "oic"],
    icon: (
      <Icon>
        <path d="M3 3v5h5" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
        <path d="M12 7v5l4 2" />
      </Icon>
    ),
  },
  {
    href: "/tasks/report",
    label: "Task Report",
    roles: ["team_leader", "oic"],
    icon: (
      <Icon>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </Icon>
    ),
  },
  {
    href: "/workstations",
    label: "Workstations",
    roles: ["team_leader"],
    icon: (
      <Icon>
        <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
        <path d="M9 20h6M12 15.5V20" />
      </Icon>
    ),
  },
];

// --- Bottom items ---
const BOTTOM_ITEMS: NavItem[] = [
  {
    href: "/account",
    label: "Account Security",
    badgeKey: "accountAlerts",
    icon: (
      <Icon>
        <rect x="4" y="10.5" width="16" height="10" rx="2" />
        <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        <circle cx="12" cy="15.5" r="1.2" />
      </Icon>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.4-2-3.4-2.2.8a7.7 7.7 0 0 0-2.6-1.5L16 2.5h-8l-.5 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.2-.8-2 3.4L2.6 10.5a7.7 7.7 0 0 0 0 3l-1.9 1.4 2 3.4 2.2-.8a7.7 7.7 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.7 7.7 0 0 0 2.6-1.5l2.2.8 2-3.4Z" />
      </Icon>
    ),
  },
  {
    href: "/guide",
    label: "User Guide",
    icon: (
      <Icon>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 21.5Z" />
        <path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H19" />
      </Icon>
    ),
  },
];

function getBadgeCount(
  item: NavItem,
  counts: {
    pendingAccessRequests: number;
    pendingLeaveRequests: number;
    pendingTaskCount: number;
    accountAlerts: number;
  },
): number {
  if (item.badgeKey === "accessRequests") return counts.pendingAccessRequests;
  if (item.badgeKey === "pendingLeave") return counts.pendingLeaveRequests;
  if (item.badgeKey === "pendingTasks") return counts.pendingTaskCount;
  if (item.badgeKey === "accountAlerts") return counts.accountAlerts;
  return 0;
}

function filterByRole(items: NavItem[], role: Profile["role"]): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

export default function Sidebar({
  profile,
  pendingAccessRequests = 0,
  pendingLeaveRequests = 0,
  pendingTaskCount = 0,
  accountAlerts = 0,
  realRole,
}: {
  profile: Profile;
  pendingAccessRequests?: number;
  pendingLeaveRequests?: number;
  pendingTaskCount?: number;
  accountAlerts?: number;
  realRole?: AppRole;
}) {
  const initials = `${profile.first_name[0] ?? ""}${profile.last_name[0] ?? ""}`.toUpperCase();
  const counts = { pendingAccessRequests, pendingLeaveRequests, pendingTaskCount, accountAlerts };

  const requestsVisible = filterByRole(REQUESTS_ITEMS, profile.role);
  const requestsBadgeTotal = requestsVisible.reduce((sum, item) => sum + getBadgeCount(item, counts), 0);

  const managementVisible = filterByRole(MANAGEMENT_ITEMS, profile.role);

  function renderNavItem(item: NavItem) {
    return (
      <NavLink
        key={item.href}
        href={item.href}
        label={item.label}
        icon={item.icon}
        badgeCount={getBadgeCount(item, counts)}
        exact={item.exact}
      />
    );
  }

  return (
    <aside className="px-3 pt-5 pb-4 flex flex-col gap-5 h-full w-full overflow-y-auto overflow-x-hidden shrink-0 bg-[var(--paper)]">
      <div className="px-1 flex items-center gap-2.5 md:group-data-[collapsed=true]/sidebar:justify-center md:group-data-[collapsed=true]/sidebar:px-0">
        <span className="hidden md:group-data-[collapsed=true]/sidebar:flex w-9 h-9 rounded-lg bg-[var(--accent)] text-white items-center justify-center font-serif font-bold text-sm shrink-0 shadow-sm">
          CN
        </span>
        <div className="md:group-data-[collapsed=true]/sidebar:hidden min-w-0">
          <div className="font-serif text-[19px] font-bold text-[var(--ink)] tracking-tight leading-tight">CRS Naga</div>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)] mt-0.5">
            Field Operations
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {/* Top-level: Dashboard, Weekly Schedule */}
        {TOP_ITEMS.map(renderNavItem)}

        {/* Community group */}
        <NavGroup
          label="Community"
          icon={
            <Icon>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Icon>
          }
          childHrefs={COMMUNITY_ITEMS.map((i) => i.href)}
        >
          {COMMUNITY_ITEMS.map(renderNavItem)}
        </NavGroup>

        {/* Requests & Tasks group */}
        <NavGroup
          label="Requests & Tasks"
          icon={
            <Icon>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M9 9h6M9 13h6M9 17h4" />
            </Icon>
          }
          childHrefs={requestsVisible.map((i) => i.href)}
          badgeCount={requestsBadgeTotal}
        >
          {requestsVisible.map(renderNavItem)}
        </NavGroup>

        {/* Management group (TL only) */}
        {managementVisible.length > 0 && (
          <NavGroup
            label="Management"
            icon={
              <Icon>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.4-2-3.4-2.2.8a7.7 7.7 0 0 0-2.6-1.5L16 2.5h-8l-.5 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.2-.8-2 3.4L2.6 10.5a7.7 7.7 0 0 0 0 3l-1.9 1.4 2 3.4 2.2-.8a7.7 7.7 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.7 7.7 0 0 0 2.6-1.5l2.2.8 2-3.4Z" />
              </Icon>
            }
            childHrefs={managementVisible.map((i) => i.href)}
          >
            {managementVisible.map(renderNavItem)}
          </NavGroup>
        )}

        {/* Bottom: Settings, User Guide */}
        {BOTTOM_ITEMS.map(renderNavItem)}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {realRole === "team_leader" && (
          <div className="md:group-data-[collapsed=true]/sidebar:hidden">
            <PreviewRoleSwitcher currentRole={profile.role} />
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] pt-3.5 flex items-center gap-2.5 md:group-data-[collapsed=true]/sidebar:justify-center">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover ring-2 ring-[var(--accent-soft)] shrink-0"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center text-[12px] font-bold shrink-0 ring-2 ring-[var(--accent-soft)]">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1 md:group-data-[collapsed=true]/sidebar:hidden">
          <div className="text-[12.5px] font-semibold text-[var(--ink)] truncate leading-tight">
            {formatFullName(profile.first_name, profile.last_name)}
          </div>
          <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{ROLE_LABEL[profile.role]}</div>
        </div>
        <div className="md:group-data-[collapsed=true]/sidebar:hidden">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

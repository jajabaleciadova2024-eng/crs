import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/database.types";

export const ROLE_LABEL: Record<AppRole, string> = {
  team_leader: "Team Leader",
  oic: "OIC",
  associate: "Associate",
};

// "Approver" here means view-scope only: team_leader and oic both see
// everyone's leave/schedule data, not just their own. It does NOT imply
// write access — see canManageOperations below for that.
export const APPROVER_ROLES: AppRole[] = ["team_leader", "oic"];

// Write access to leave approve/reject, schedule generate/reassign, and
// workstation management — Team Leader only. OIC has view-all visibility
// (isApprover) but no longer any of these write actions.
export function canManageOperations(role: AppRole) {
  return role === "team_leader";
}

export const PREVIEW_ROLE_COOKIE = "preview_role";
const PREVIEWABLE_ROLES: AppRole[] = ["oic", "associate"];

// Fetches the signed-in user's profile, plus preview-mode info. Redirects to
// /login if there's no session.
//
// Preview mode: a real Team Leader can set the `preview_role` cookie (via
// /api/preview-role, from the sidebar switcher) to see the entire app
// exactly as an OIC or Associate would — nav, page guards, buttons, the
// User Guide, all of it, since they all key off `profile.role`. This is a
// UI/UX preview only, not a real permission boundary: the underlying
// Supabase session is still the Team Leader's, so RLS and every API route's
// own role check (which reads the real DB row, not this override) still
// grant full Team Leader authority regardless of what's being previewed —
// intentional, since this is a testing aid for a trusted role, not a
// privilege-restriction mechanism.
// Wrapped in React's cache() so the layout and the page (both of which call
// requireProfile()/requireProfileWithPreview() independently, plus the
// proxy middleware doing its own session check) don't each trigger a fresh
// getUser() + profile round-trip to Supabase — within a single request
// they now share one result. This was the main source of page-load delay:
// 2-3 redundant Supabase Auth/DB round-trips stacked on every navigation.
export const requireProfileWithPreview = cache(
  async (): Promise<{
    profile: Profile;
    realRole: AppRole;
    previewing: boolean;
  }> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { data: dbProfile, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    if (error || !dbProfile) {
      redirect("/login");
    }

    if (dbProfile.role === "team_leader") {
      const cookieStore = await cookies();
      const previewRole = cookieStore.get(PREVIEW_ROLE_COOKIE)?.value as AppRole | undefined;
      if (previewRole && PREVIEWABLE_ROLES.includes(previewRole)) {
        return { profile: { ...dbProfile, role: previewRole }, realRole: "team_leader", previewing: true };
      }
    }

    return { profile: dbProfile, realRole: dbProfile.role, previewing: false };
  }
);

// Call after requireProfile() on pages restricted to specific roles.
// Redirects to the dashboard (with a denial flag) rather than throwing, so a
// stale bookmark/link degrades gracefully instead of erroring. Also
// correctly blocks a previewing Team Leader from Team-Leader-only pages,
// same as the role they're previewing would be blocked.
export async function requireRole(profile: Profile, allowed: AppRole[]) {
  if (!allowed.includes(profile.role)) {
    redirect("/?denied=1");
  }
}

// Fetches the signed-in user's profile. Redirects to /login if there's no
// session — call this at the top of any protected Server Component/layout.
// Returns the *effective* (preview-aware) role — see requireProfileWithPreview
// above. Use requireProfileWithPreview directly if you need the real role
// too (e.g. to render the preview switcher itself).
export async function requireProfile(): Promise<Profile> {
  const { profile } = await requireProfileWithPreview();
  return profile;
}

export function isApprover(role: AppRole) {
  return APPROVER_ROLES.includes(role);
}

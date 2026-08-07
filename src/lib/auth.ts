import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/database.types";

export const ROLE_LABEL: Record<AppRole, string> = {
  team_leader: "Team Leader",
  oic: "OIC",
  associate: "Associate",
};

export const APPROVER_ROLES: AppRole[] = ["team_leader", "oic"];

// Fetches the signed-in user's profile. Redirects to /login if there's no
// session — call this at the top of any protected Server Component/layout.
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return profile;
}

// Call after requireProfile() on pages restricted to specific roles.
// Redirects to the dashboard (with a denial flag) rather than throwing, so a
// stale bookmark/link degrades gracefully instead of erroring.
export async function requireRole(profile: Profile, allowed: AppRole[]) {
  if (!allowed.includes(profile.role)) {
    redirect("/?denied=1");
  }
}

export function isApprover(role: AppRole) {
  return APPROVER_ROLES.includes(role);
}

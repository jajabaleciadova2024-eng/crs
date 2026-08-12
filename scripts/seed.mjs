// One-off seed script: creates the first Team Leader account (via Supabase
// invite email) and the initial set of workstations.
//
// Usage: node scripts/seed.mjs
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(root, ".env.local");

function loadEnv(filePath) {
  const contents = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv(envPath);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = env.NEXT_PUBLIC_SITE_URL ?? "https://crs.jajabaleciado.com";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSTATIONS = [
  { name: "Screener", description: "Initial document screening" },
  { name: "Collecting Officer", description: "Collects submitted documents" },
  { name: "Releasing Officer", description: "Releases processed documents" },
  { name: "PACD", description: "Post-approval control desk" },
  { name: "Electronic Endorsement", description: "Digital endorsement queue" },
  { name: "Premium Annotation", description: "Premium lane annotation" },
];

const TEAM_LEADER = {
  psid: "337912",
  first_name: "Jerick",
  middle_name: null,
  last_name: "Salinas",
  email: "jerickpsalinas@gmail.com",
  mobile_number: "09564112380",
  role: "team_leader",
};

async function main() {
  console.log("Seeding workstations...");
  for (const ws of WORKSTATIONS) {
    const { error } = await admin.from("workstations").upsert(ws, { onConflict: "name" });
    if (error) {
      console.error(`  ✗ ${ws.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${ws.name}`);
    }
  }

  console.log("\nCreating Team Leader account...");
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", TEAM_LEADER.email)
    .maybeSingle();

  if (existing) {
    console.log(`  Profile for ${TEAM_LEADER.email} already exists — skipping invite.`);
    return;
  }

  // See src/app/api/team/route.ts for why this points at /reset-password
  // rather than "/" — the root is middleware-guarded and never sees the
  // session token, which lands the invite on /login instead.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(TEAM_LEADER.email, {
    redirectTo: `${SITE_URL}/reset-password`,
  });
  if (inviteError || !invited?.user) {
    console.error(`  ✗ Invite failed: ${inviteError?.message}`);
    process.exit(1);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    ...TEAM_LEADER,
  });

  if (profileError) {
    console.error(`  ✗ Profile insert failed: ${profileError.message}`);
    await admin.auth.admin.deleteUser(invited.user.id);
    process.exit(1);
  }

  console.log(`  ✓ Invited ${TEAM_LEADER.email} as Team Leader (PSID ${TEAM_LEADER.psid}). Check the inbox for the invite link.`);
}

main().then(() => {
  console.log("\nDone.");
});

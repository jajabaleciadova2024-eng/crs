import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// NOTE: deliberately untyped — see src/lib/supabase/client.ts for why the
// <Database> generic is omitted here.
// Service-role client — bypasses RLS. Only ever import this from server-side
// code (Route Handlers / Server Actions) that has already verified the
// caller's role, e.g. the /team member-management endpoints. Never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

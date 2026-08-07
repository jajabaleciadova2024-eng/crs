"use client";

import { createBrowserClient } from "@supabase/ssr";

// NOTE: deliberately untyped (no <Database> generic). The installed
// @supabase/ssr + supabase-js combo has a generic-resolution bug where any
// Database type with a union-typed column collapses every query result to
// `never` (reproduced in isolation, independent of our schema's shape — see
// src/lib/database.types.ts for the full write-up). Row/Insert/Update shapes
// still live in database.types.ts as reference documentation; call sites
// that need row shape safety import those interfaces directly and annotate
// or cast locally, matching the pattern already used for joined columns.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

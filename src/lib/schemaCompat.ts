/**
 * Talking to a database that may be one migration behind the code.
 *
 * Migrations here are applied by hand in the Supabase SQL editor (see the
 * README), so a deploy can land minutes — or days — before the column it
 * needs exists. PostgREST does not fail quietly when that happens: the
 * member gets "Could not find the 'photo_paths' column of
 * 'member_task_completions' in the schema cache" printed under the Submit
 * button, and the work they just did is thrown away.
 *
 * These helpers let a query name a new column, recognise that one specific
 * failure, and retry in the pre-migration shape — so the feature degrades
 * (one proof photo instead of six) instead of breaking outright. The
 * console warning is the reminder that the migration is still pending.
 */

export type QueryErrorish = { code?: string | null; message?: string | null } | null | undefined;

/**
 * True only for "this column does not exist", and only for the column asked
 * about — every other database error still has to surface as itself.
 */
export function isMissingColumnError(error: QueryErrorish, column: string): boolean {
  if (!error) return false;
  // PGRST204 — PostgREST's schema cache has no such column (writes).
  // 42703   — Postgres' own "column does not exist" (reads that reach the DB).
  const code = error.code ?? "";
  if (code !== "PGRST204" && code !== "42703") return false;
  return (error.message ?? "").includes(column);
}

/**
 * Run a query; if it failed *only* because `column` isn't there yet, run the
 * fallback instead. Anything else is returned untouched.
 */
export async function withMissingColumnFallback<T extends { error: QueryErrorish }>(
  column: string,
  attempt: () => PromiseLike<T>,
  fallback: () => PromiseLike<T>,
): Promise<T> {
  const first = await attempt();
  if (!isMissingColumnError(first.error, column)) return first;
  console.warn(
    `[schemaCompat] '${column}' is missing from the database — using the pre-migration path. Run the pending migration in supabase/migrations.`,
  );
  return fallback();
}

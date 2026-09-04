import { describe, expect, it, vi } from "vitest";
import { isMissingColumnError, withMissingColumnFallback } from "./schemaCompat";
import type { QueryErrorish } from "./schemaCompat";

// What a Supabase query resolves to, narrowed to the two fields these
// helpers look at.
type Result = { data: string | null; error: QueryErrorish };
const result = (data: string | null, error: QueryErrorish = null): Promise<Result> =>
  Promise.resolve({ data, error });

// The exact payload PostgREST returned when 0044 hadn't been applied yet —
// the error the member saw printed under the Submit button.
const missingPhotoPaths = {
  code: "PGRST204",
  message: "Could not find the 'photo_paths' column of 'member_task_completions' in the schema cache",
};

describe("isMissingColumnError", () => {
  it("recognises PostgREST's schema-cache miss for the named column", () => {
    expect(isMissingColumnError(missingPhotoPaths, "photo_paths")).toBe(true);
  });

  it("recognises Postgres' own undefined-column code", () => {
    expect(
      isMissingColumnError({ code: "42703", message: 'column "photo_paths" does not exist' }, "photo_paths"),
    ).toBe(true);
  });

  it("is not fooled by the same code about a different column", () => {
    expect(isMissingColumnError(missingPhotoPaths, "completion_date")).toBe(false);
  });

  it("leaves every other failure alone", () => {
    expect(isMissingColumnError({ code: "23505", message: "duplicate key value" }, "photo_paths")).toBe(false);
    expect(isMissingColumnError(null, "photo_paths")).toBe(false);
    expect(isMissingColumnError(undefined, "photo_paths")).toBe(false);
  });
});

describe("withMissingColumnFallback", () => {
  it("keeps the first result when it worked", async () => {
    const fallback = vi.fn();
    const out = await withMissingColumnFallback<Result>("photo_paths", () => result("full"), fallback);
    expect(out.data).toBe("full");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("retries without the column when the database is a migration behind", async () => {
    const out = await withMissingColumnFallback<Result>(
      "photo_paths",
      () => result(null, missingPhotoPaths),
      () => result("degraded"),
    );
    expect(out.data).toBe("degraded");
  });

  it("does not swallow an unrelated error", async () => {
    const fallback = vi.fn();
    const out = await withMissingColumnFallback<Result>(
      "photo_paths",
      () => result(null, { code: "42501", message: "permission denied" }),
      fallback,
    );
    expect(out.error?.code).toBe("42501");
    expect(fallback).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";
import {
  UPLOAD_BUDGET_BYTES,
  formatBytes,
  perFileTargetBytes,
  readUploadError,
  statusMessage,
  totalBytes,
} from "./imageUpload";

describe("perFileTargetBytes", () => {
  it("splits the budget between the photos being sent together", () => {
    expect(perFileTargetBytes(6)).toBeLessThan(perFileTargetBytes(1));
    expect(perFileTargetBytes(6) * 6).toBeLessThanOrEqual(UPLOAD_BUDGET_BYTES);
  });

  it("never squeezes a photo below the point of being readable", () => {
    expect(perFileTargetBytes(50)).toBe(240_000);
  });

  it("has an answer for an empty pick", () => {
    expect(perFileTargetBytes(0)).toBeGreaterThan(0);
  });
});

describe("statusMessage", () => {
  it("explains the platform's body-size refusal, which never reaches our route", () => {
    expect(statusMessage(413)).toMatch(/too large/i);
  });

  it("says nothing about statuses the route answers itself", () => {
    expect(statusMessage(400)).toBeNull();
    expect(statusMessage(403)).toBeNull();
  });
});

describe("readUploadError", () => {
  const jsonResponse = (status: number, body: unknown) =>
    ({ status, json: () => Promise.resolve(body) }) as Response;

  it("prefers the route's own message", async () => {
    const res = jsonResponse(400, { error: "This task requires a photo as proof." });
    expect(await readUploadError(res, "Couldn't submit.")).toBe("This task requires a photo as proof.");
  });

  it("explains a platform rejection that carried no JSON", async () => {
    const res = { status: 413, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
    expect(await readUploadError(res, "Couldn't submit.")).toMatch(/too large/i);
  });

  it("falls back to the caller's wording when there is nothing else to go on", async () => {
    const res = { status: 500, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
    expect(await readUploadError(res, "Couldn't submit.")).toBe("Couldn't submit.");
  });
});

describe("size helpers", () => {
  it("adds up what a request would carry", () => {
    expect(totalBytes([{ size: 1000 }, { size: 2000 }])).toBe(3000);
  });

  it("formats sizes the way the message reads them back", () => {
    expect(formatBytes(4 * 1024 * 1024)).toBe("4.0MB");
    expect(formatBytes(150 * 1024)).toBe("150KB");
  });
});

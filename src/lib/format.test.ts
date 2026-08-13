import { describe, it, expect } from "vitest";
import { toTitleCase, formatFullName } from "./format";

describe("toTitleCase", () => {
  it("title-cases an all-caps name", () => {
    expect(toTitleCase("MARIELLA ROMERO")).toBe("Mariella Romero");
  });

  it("title-cases an all-lowercase name", () => {
    expect(toTitleCase("jerick salinas")).toBe("Jerick Salinas");
  });

  it("normalizes mixed/odd casing", () => {
    expect(toTitleCase("jErIcK sALinAS")).toBe("Jerick Salinas");
  });

  it("handles a single word", () => {
    expect(toTitleCase("mariel")).toBe("Mariel");
  });

  it("handles multi-word names with more than two parts", () => {
    expect(toTitleCase("DE LOS SANTOS")).toBe("De Los Santos");
  });

  it("returns an empty string for null/undefined/empty input", () => {
    expect(toTitleCase(null)).toBe("");
    expect(toTitleCase(undefined)).toBe("");
    expect(toTitleCase("")).toBe("");
  });
});

describe("formatFullName", () => {
  it("joins first and last name, title-cased", () => {
    expect(formatFullName("JERICK", "SALINAS")).toBe("Jerick Salinas");
  });

  it("includes a middle name when present", () => {
    expect(formatFullName("MARIEL", "BARBOSA", "MAE")).toBe("Mariel Mae Barbosa");
  });

  it("omits a null/missing middle name cleanly", () => {
    expect(formatFullName("JERICK", "SALINAS", null)).toBe("Jerick Salinas");
  });
});

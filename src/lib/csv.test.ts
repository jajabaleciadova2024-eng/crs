import { describe, expect, it } from "vitest";
import { csvField, csvRow, csvFile, slugForFilename } from "./csv";

describe("csvField", () => {
  it("leaves a plain value unquoted", () => {
    expect(csvField("CRS Naga")).toBe("CRS Naga");
    expect(csvField(536102)).toBe("536102");
  });

  it("returns empty for null and undefined, not the word", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(csvField("Due: September 4, 2026")).toBe('"Due: September 4, 2026"');
  });

  it("doubles an embedded quote", () => {
    expect(csvField('He said "yes"')).toBe('"He said ""yes"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvField("WITH CERTIFICATE OF COMPLETION\n(Yes / None)")).toBe(
      '"WITH CERTIFICATE OF COMPLETION\n(Yes / None)"',
    );
  });

  it("quotes a value with padding, which a reader would otherwise trim away", () => {
    expect(csvField("PSID ")).toBe('"PSID "');
  });
});

describe("csvRow", () => {
  it("joins fields and keeps empty ones as empty columns", () => {
    expect(csvRow(["CRS Naga", 536102, null, "8/3/2026", "Yes", "Completed"])).toBe(
      "CRS Naga,536102,,8/3/2026,Yes,Completed",
    );
  });
});

describe("csvFile", () => {
  it("starts with a BOM and separates rows with CRLF", () => {
    const out = csvFile([["a"], ["b"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿a\r\nb\r\n");
  });
});

describe("slugForFilename", () => {
  it("hyphenates and strips punctuation", () => {
    expect(slugForFilename("2026 Security Awareness")).toBe("2026-Security-Awareness");
    expect(slugForFilename("2026 Unisys Code Of Conduct")).toBe("2026-Unisys-Code-Of-Conduct");
  });

  it("never returns an empty name", () => {
    expect(slugForFilename("!!!")).toBe("task");
  });
});

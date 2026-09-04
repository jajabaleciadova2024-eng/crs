// Minimal RFC 4180 CSV writing.
//
// Excel is the destination here, and it is unforgiving in two specific ways
// that a naive `join(",")` gets wrong: a field containing a comma, a quote or
// a newline has to be quoted, and a quote inside a quoted field is written
// twice. The sample export this matches has a header cell with a newline in
// it ("WITH CERTIFICATE OF COMPLETION\n(Yes / None)"), so this is not
// hypothetical.

/** One field, quoted only when it has to be. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Leading/trailing spaces are also quoted: unquoted, some readers trim
  // them and the value silently changes.
  const needsQuotes = /[",\r\n]/.test(s) || s !== s.trim();
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(",");
}

/**
 * A whole file. CRLF line endings and a UTF-8 BOM, both for Excel: without
 * the BOM it reads the file as the local codepage and mangles any non-ASCII
 * name, which on this team is a real risk (ñ, é).
 */
export function csvFile(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map(csvRow).join("\r\n") + "\r\n";
}

/** "2026 Security Awareness" -> "2026-Security-Awareness" for a filename. */
export function slugForFilename(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      // Collapse runs: "Task - Member" becomes "Task---Member" otherwise,
      // because the separator's own spaces each turn into a hyphen too.
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "task"
  );
}

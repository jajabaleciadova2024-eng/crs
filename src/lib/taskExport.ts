// Building the per-task compliance sheet.
//
// Kept separate from the route so the shape can be tested without a
// database: the column order, the date formats and the status wording are
// the parts that have to match the sheet this replaces, and they are also
// exactly the parts a later edit could quietly break.

import { csvFile, slugForFilename } from "@/lib/csv";

export const EXPORT_OUTLET = "CRS Naga";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** M/D/YYYY, no leading zeros — the format the existing sheets use. */
export function usDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

export function longDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Completed",
  pending: "For approval",
  rejected: "Declined",
};

export type ExportPerson = {
  psid: string | null;
  first_name: string;
  last_name: string;
  status?: string | null;
  /** What the member said; falls back to when they submitted. */
  completion_date?: string | null;
  completed_at?: string | null;
  has_proof?: boolean;
};

export function buildTaskExportRows(
  task: { title: string; deadline: string | null },
  people: ExportPerson[],
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [
    [task.title, "", "", "", "", ""],
    [task.deadline ? `Due: ${longDate(task.deadline)}` : "No deadline", "", "", "", "", ""],
    [
      "OUTLET",
      "PSID",
      "NAME",
      "DATE OF COMPLETION",
      "WITH CERTIFICATE OF COMPLETION\n(Yes / None)",
      "Status",
    ],
  ];

  for (const p of people) {
    rows.push([
      EXPORT_OUTLET,
      p.psid ?? "",
      `${p.first_name} ${p.last_name}`.trim(),
      // The sheet asks when the work was done, not when it was filed.
      usDate(p.completion_date ?? p.completed_at ?? null),
      p.has_proof ? "Yes" : "None",
      p.status ? (STATUS_LABEL[p.status] ?? p.status) : "Not completed",
    ]);
  }

  return rows;
}

export function taskExportFile(
  task: { title: string; deadline: string | null },
  people: ExportPerson[],
): { body: string; filename: string } {
  return {
    body: csvFile(buildTaskExportRows(task, people)),
    filename: `${slugForFilename(task.title)}.csv`,
  };
}

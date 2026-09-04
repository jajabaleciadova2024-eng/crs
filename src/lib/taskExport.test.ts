import { describe, expect, it } from "vitest";
import { buildTaskExportRows, taskExportFile, usDate, longDate } from "./taskExport";

const TASK = { title: "2026 Security Awareness", deadline: "2026-09-04" };

describe("dates", () => {
  it("writes M/D/YYYY with no leading zeros, as the existing sheets do", () => {
    expect(usDate("2026-08-03")).toBe("8/3/2026");
    expect(usDate("2026-09-02")).toBe("9/2/2026");
    expect(usDate("2026-12-25")).toBe("12/25/2026");
  });

  it("returns empty rather than a placeholder when there is no date", () => {
    expect(usDate(null)).toBe("");
    expect(usDate("")).toBe("");
    expect(usDate("not a date")).toBe("");
  });

  it("spells the due date out for the header row", () => {
    expect(longDate("2026-09-04")).toBe("September 4, 2026");
  });
});

describe("buildTaskExportRows", () => {
  it("puts the title and due date above the table, six columns wide", () => {
    const rows = buildTaskExportRows(TASK, []);
    expect(rows[0]).toEqual(["2026 Security Awareness", "", "", "", "", ""]);
    expect(rows[1]).toEqual(["Due: September 4, 2026", "", "", "", "", ""]);
    expect(rows[2]).toEqual([
      "OUTLET",
      "PSID",
      "NAME",
      "DATE OF COMPLETION",
      "WITH CERTIFICATE OF COMPLETION\n(Yes / None)",
      "Status",
    ]);
    expect(rows.every((r) => r.length === 6)).toBe(true);
  });

  it("says so plainly when a task has no deadline", () => {
    expect(buildTaskExportRows({ title: "x", deadline: null }, [])[1][0]).toBe("No deadline");
  });

  it("maps an approved submission with proof to the sheet's own wording", () => {
    const [row] = buildTaskExportRows(TASK, [
      {
        psid: "536102",
        first_name: "Abegail",
        last_name: "Fabay",
        status: "approved",
        completion_date: "2026-08-03",
        has_proof: true,
      },
    ]).slice(3);
    expect(row).toEqual(["CRS Naga", "536102", "Abegail Fabay", "8/3/2026", "Yes", "Completed"]);
  });

  it("prefers the date the member did the work over the day they filed it", () => {
    const [row] = buildTaskExportRows(TASK, [
      {
        psid: "1",
        first_name: "A",
        last_name: "B",
        status: "approved",
        completion_date: "2026-08-03",
        completed_at: "2026-09-01T04:00:00Z",
      },
    ]).slice(3);
    expect(row[3]).toBe("8/3/2026");
  });

  it("falls back to the submitted timestamp when no completion date was asked for", () => {
    const [row] = buildTaskExportRows(TASK, [
      { psid: "1", first_name: "A", last_name: "B", status: "approved", completed_at: "2026-09-01T04:00:00Z" },
    ]).slice(3);
    expect(row[3]).toBe("9/1/2026");
  });

  it("includes members who have not submitted, which is the point of the sheet", () => {
    const [row] = buildTaskExportRows(TASK, [
      { psid: "536115", first_name: "Ilene", last_name: "Santiago" },
    ]).slice(3);
    expect(row).toEqual(["CRS Naga", "536115", "Ilene Santiago", "", "None", "Not completed"]);
  });

  it("distinguishes awaiting review from done", () => {
    const rows = buildTaskExportRows(TASK, [
      { psid: "1", first_name: "A", last_name: "B", status: "pending" },
      { psid: "2", first_name: "C", last_name: "D", status: "rejected" },
    ]).slice(3);
    expect(rows[0][5]).toBe("For approval");
    expect(rows[1][5]).toBe("Declined");
  });

  it("leaves PSID empty rather than writing null", () => {
    expect(buildTaskExportRows(TASK, [{ psid: null, first_name: "A", last_name: "B" }])[3][1]).toBe("");
  });
});

describe("taskExportFile", () => {
  it("quotes the multi-line header cell and the comma in the due date", () => {
    const { body } = taskExportFile(TASK, []);
    expect(body).toContain('"Due: September 4, 2026"');
    expect(body).toContain('"WITH CERTIFICATE OF COMPLETION\n(Yes / None)"');
  });

  it("names the file after the task, so one download is one task", () => {
    expect(taskExportFile(TASK, []).filename).toBe("2026-Security-Awareness.csv");
    expect(taskExportFile({ title: "2026 Unisys Code Of Conduct", deadline: null }, []).filename).toBe(
      "2026-Unisys-Code-Of-Conduct.csv",
    );
  });
});

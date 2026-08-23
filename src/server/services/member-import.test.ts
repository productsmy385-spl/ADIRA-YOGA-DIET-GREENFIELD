import { describe, expect, it } from "vitest";

import { candidatesFrom, IMPORT_TEMPLATE_HEADERS, previewMemberImport } from "./member-import";

const HEADER = "email,full_name,phone,locale\n";

describe("member import preview", () => {
  it("accepts a plain file and normalises what it keeps", () => {
    const summary = previewMemberImport(
      `${HEADER}Asha@Example.COM ,  Asha Rao  ,+91 90000 00000,hi\n`,
    );

    expect(summary.valid).toBe(1);
    expect(candidatesFrom(summary)).toEqual([
      {
        // Lower-cased and trimmed, because `users.email` has a CHECK that it equals
        // lower(email) — an unnormalised row would fail at the INSERT, mid-transaction,
        // after the operator was told it was valid.
        email: "asha@example.com",
        fullName: "Asha Rao",
        phone: "+91 90000 00000",
        locale: "hi",
      },
    ]);
  });

  it("defaults an absent locale to English rather than rejecting the row", () => {
    const summary = previewMemberImport("email,full_name\nasha@example.com,Asha Rao\n");
    expect(summary.valid).toBe(1);
    expect(candidatesFrom(summary)[0].locale).toBe("en");
    expect(candidatesFrom(summary)[0].phone).toBeNull();
  });

  it("reports a missing required column once, not once per row", () => {
    const summary = previewMemberImport("email\na@example.com\nb@example.com\n");

    expect(summary.fileErrors).toHaveLength(1);
    expect(summary.fileErrors[0]).toContain("full_name");
    // Three hundred identical row errors would hide the one fact that matters.
    expect(summary.rows).toEqual([]);
  });

  it("reports every problem in a row, not just the first", () => {
    const summary = previewMemberImport(`${HEADER}not-an-email,,,\n`);

    const row = summary.rows[0];
    expect(row.status).toBe("INVALID");
    expect(row.errors.length).toBeGreaterThan(1);
  });

  it("keeps going after a bad row so one pass finds everything", () => {
    const summary = previewMemberImport(
      `${HEADER}bad,Person One,,\n` +
        `good@example.com,Person Two,,\n` +
        `,Person Three,,\n` +
        `also.good@example.com,Person Four,,\n`,
    );

    expect(summary.valid).toBe(2);
    expect(summary.invalid).toBe(2);
  });

  it("treats two rows differing only in case as the same person", () => {
    // `users_email_unique_per_org` is on the lower-cased address, so the database would
    // agree. Letting both through would abort the import on the second insert.
    const summary = previewMemberImport(
      `${HEADER}asha@example.com,Asha Rao,,\nASHA@EXAMPLE.COM,Asha R,,\n`,
    );

    expect(summary.valid).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(candidatesFrom(summary)).toHaveLength(1);
  });

  it("reports the original line number for every problem", () => {
    // The operator fixes the file in a spreadsheet, so the number must match what they
    // see there — an index into the valid rows would send them to the wrong line.
    const summary = previewMemberImport(
      `${HEADER}a@example.com,A,,\nbroken,,,\nc@example.com,C,,\n`,
    );

    const broken = summary.rows.find((row) => row.status === "INVALID");
    expect(broken?.line).toBe(3);
  });

  it("rejects an unsupported language rather than silently serving English", () => {
    const summary = previewMemberImport(`${HEADER}a@example.com,A,,fr\n`);
    expect(summary.rows[0].status).toBe("INVALID");
    expect(summary.rows[0].errors.join(" ")).toContain("fr");
  });

  it("survives Excel's BOM and CRLF line endings", () => {
    // Both arrive from a real studio's export. A BOM left in place turns the first header
    // into "﻿email" and makes every column lookup fail with no visible cause.
    const summary = previewMemberImport(
      `﻿email,full_name\r\nasha@example.com,Asha Rao\r\n`,
    );
    expect(summary.valid).toBe(1);
  });

  it("handles a quoted field containing a comma", () => {
    const summary = previewMemberImport(
      `${HEADER}asha@example.com,"Rao, Asha",,\n`,
    );
    expect(candidatesFrom(summary)[0].fullName).toBe("Rao, Asha");
  });

  it("offers a template whose headers the parser accepts", () => {
    // Guards the loop where the downloadable template drifts from the required columns
    // and every import of it fails on a missing column.
    const summary = previewMemberImport(
      `${IMPORT_TEMPLATE_HEADERS.join(",")}\nasha@example.com,Asha Rao,,en\n`,
    );
    expect(summary.fileErrors).toEqual([]);
    expect(summary.valid).toBe(1);
  });
});

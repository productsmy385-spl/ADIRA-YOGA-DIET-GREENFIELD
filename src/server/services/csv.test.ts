import { describe, expect, it } from "vitest";

import { parseCsv, toCsv, validateRows, type CsvRow } from "./csv";

describe("parseCsv", () => {
  it("reads a simple file", () => {
    const result = parseCsv("email,name\na@x.test,Anita\nb@x.test,Bhavna\n");

    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].values).toEqual({ email: "a@x.test", name: "Anita" });
    // Line 2, not 0 — it must match what the spreadsheet shows the person fixing it.
    expect(result.rows[0].line).toBe(2);
  });

  // Excel writes a BOM. Left in, the first header becomes an invisible character followed
  // by "email", and every lookup on it fails with no visible cause.
  it("strips the UTF-8 BOM Excel prepends", () => {
    const result = parseCsv("﻿email,name\na@x.test,Anita\n");
    expect(result.headers).toEqual(["email", "name"]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("email,name\r\na@x.test,Anita\r\n");
    expect(result.rows[0].values.name).toBe("Anita");
  });

  it("keeps commas inside quoted fields", () => {
    const result = parseCsv('email,note\na@x.test,"knee sore, improving"\n');
    expect(result.rows[0].values.note).toBe("knee sore, improving");
  });

  it("unescapes doubled quotes", () => {
    const result = parseCsv('email,note\na@x.test,"she said ""fine"""\n');
    expect(result.rows[0].values.note).toBe('she said "fine"');
  });

  it("keeps newlines inside quoted fields", () => {
    const result = parseCsv('email,note\na@x.test,"line one\nline two"\n');
    expect(result.rows[0].values.note).toBe("line one\nline two");
    expect(result.rows).toHaveLength(1);
  });

  it("reads a final line with no trailing newline", () => {
    const result = parseCsv("email,name\na@x.test,Anita");
    expect(result.rows).toHaveLength(1);
  });

  // A trailing newline yields one empty record; without this every import reports a
  // spurious blank row at the end and the counts look wrong.
  it("ignores blank trailing rows", () => {
    const result = parseCsv("email,name\na@x.test,Anita\n\n\n");
    expect(result.rows).toHaveLength(1);
  });

  it("lowercases and trims headers", () => {
    const result = parseCsv(" Email , Full Name \na@x.test,Anita\n");
    expect(result.headers).toEqual(["email", "full name"]);
  });

  it("reports an unclosed quote rather than silently truncating", () => {
    const result = parseCsv('email,note\na@x.test,"never closed\n');
    expect(result.errors.join(" ")).toMatch(/not closed/i);
  });

  it("reports duplicate columns", () => {
    const result = parseCsv("email,email\na@x.test,b@x.test\n");
    expect(result.errors.join(" ")).toMatch(/duplicate/i);
  });

  it("reports an empty file", () => {
    expect(parseCsv("").errors.join(" ")).toMatch(/empty/i);
    expect(parseCsv("   \n  ").errors.join(" ")).toMatch(/empty/i);
  });
});

interface Customer {
  email: string;
  fullName: string;
}

function validateCustomer(row: CsvRow) {
  const errors: string[] = [];
  const email = (row.values.email ?? "").toLowerCase();
  const fullName = row.values["full name"] ?? "";

  if (!email) errors.push("Email is required.");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Email is not valid.");
  if (!fullName) errors.push("Full name is required.");

  return errors.length > 0
    ? ({ ok: false, errors } as const)
    : ({ ok: true, value: { email, fullName }, key: email } as const);
}

describe("validateRows", () => {
  const parse = (text: string) => parseCsv(text);

  it("marks good rows valid", () => {
    const summary = validateRows<Customer>(
      parse("email,full name\na@x.test,Anita\n"),
      ["email", "full name"],
      validateCustomer,
    );

    expect(summary.valid).toBe(1);
    expect(summary.rows[0].value).toEqual({ email: "a@x.test", fullName: "Anita" });
  });

  /**
   * §23's preview. Someone importing 300 customers must be able to fix everything in one
   * pass — an importer that stops at row 3 is one they work around by splitting the file.
   */
  it("reports every bad row, not just the first", () => {
    const summary = validateRows<Customer>(
      parse("email,full name\nbad,Anita\nb@x.test,\nc@x.test,Chandra\n"),
      ["email", "full name"],
      validateCustomer,
    );

    expect(summary.invalid).toBe(2);
    expect(summary.valid).toBe(1);
    expect(summary.rows[0].errors.join(" ")).toMatch(/not valid/i);
    expect(summary.rows[1].errors.join(" ")).toMatch(/required/i);
    // Line numbers point at the spreadsheet rows the person has to open.
    expect(summary.rows.map((r) => r.line)).toEqual([2, 3, 4]);
  });

  it("flags duplicates within the file, keeping the first", () => {
    const summary = validateRows<Customer>(
      parse("email,full name\na@x.test,Anita\na@x.test,Anita Again\n"),
      ["email", "full name"],
      validateCustomer,
    );

    expect(summary.valid).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(summary.rows[1].status).toBe("DUPLICATE");
  });

  // A missing column would make every row report the same error, and three hundred
  // identical messages hide the single fact that matters.
  it("reports a missing column once, at file level, not per row", () => {
    const summary = validateRows<Customer>(
      parse("email\na@x.test\n"),
      ["email", "full name"],
      validateCustomer,
    );

    expect(summary.fileErrors.join(" ")).toMatch(/full name/i);
    expect(summary.rows).toHaveLength(0);
  });
});

describe("toCsv", () => {
  it("writes a header and rows", () => {
    expect(toCsv(["a", "b"], [{ a: "1", b: "2" }])).toBe("a,b\r\n1,2");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(toCsv(["note"], [{ note: "a,b" }])).toContain('"a,b"');
    expect(toCsv(["note"], [{ note: 'say "hi"' }])).toContain('"say ""hi"""');
    expect(toCsv(["note"], [{ note: "one\ntwo" }])).toContain('"one\ntwo"');
  });

  it("renders null and undefined as empty", () => {
    expect(toCsv(["a", "b"], [{ a: null, b: undefined }])).toBe("a,b\r\n,");
  });

  /**
   * FORMULA INJECTION. Excel and Sheets execute a cell beginning = + - or @, so a
   * customer's note reading `=HYPERLINK("http://evil","click")` becomes a live link in
   * whatever a consultant opens the export with. The tab prefix defuses it and displays
   * identically.
   */
  it("neutralises values that spreadsheets would execute as formulas", () => {
    for (const dangerous of ["=1+1", "+1", "-1", "@SUM(A1)", '=HYPERLINK("http://evil")']) {
      const output = toCsv(["note"], [{ note: dangerous }]);
      const cell = output.split("\r\n")[1];
      expect(cell.startsWith("\t") || cell.startsWith('"\t')).toBe(true);
    }
  });

  it("leaves ordinary values untouched", () => {
    expect(toCsv(["note"], [{ note: "knee sore" }])).toBe("note\r\nknee sore");
  });
});

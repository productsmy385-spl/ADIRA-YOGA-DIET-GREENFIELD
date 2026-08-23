/**
 * CSV parsing and validation (Phase 13).
 *
 * Hand-written rather than a library, because the parsing rules a wellness studio's
 * spreadsheet actually needs are small and the failure modes are specific: an email with
 * a comma in a quoted field, a BOM from Excel, CRLF line endings from Windows. A general
 * library handles all of that too, but it also imports a dependency for a hundred lines
 * of well-understood logic, and it does not know what a *good error message* is here.
 *
 * Everything is pure. The import flow — preview, confirm, transaction — is a repository
 * concern; deciding whether row 47 is valid is this file's, and it is testable without a
 * database or a file.
 */

export interface CsvRow {
  /** 1-based, matching what the spreadsheet shows the user. Row 1 is the header. */
  line: number;
  values: Record<string, string>;
}

export interface ParseResult {
  headers: string[];
  rows: CsvRow[];
  errors: string[];
}

/**
 * Parse CSV text.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded commas and newlines, CRLF, and
 * the UTF-8 BOM Excel prepends — which, left in place, turns the first header into
 * `﻿email` and makes every column lookup fail with no visible cause.
 */
export function parseCsv(text: string): ParseResult {
  const errors: string[] = [];

  // Excel writes a BOM. Stripping it is the difference between "email" and an invisible
  // character followed by "email".
  const input = text.replace(/^﻿/, "");

  if (input.trim().length === 0) {
    return { headers: [], rows: [], errors: ["The file is empty."] };
  }

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char === "\r") {
      // CRLF: the \n on the next iteration ends the record.
    } else {
      field += char;
    }
  }

  // A final line with no trailing newline still holds a record.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (inQuotes) {
    errors.push("A quoted value is not closed — check for a stray double quote.");
  }

  const [headerRecord, ...dataRecords] = records;
  const headers = (headerRecord ?? []).map((h) => h.trim().toLowerCase());

  if (headers.length === 0) {
    return { headers: [], rows: [], errors: ["The file has no header row."] };
  }

  const duplicates = headers.filter((h, i) => headers.indexOf(h) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate column(s): ${[...new Set(duplicates)].join(", ")}.`);
  }

  const rows: CsvRow[] = dataRecords
    // A trailing newline produces one empty record; skipping it stops every import
    // reporting a spurious blank row at the end.
    .filter((r) => r.some((v) => v.trim().length > 0))
    .map((values, index) => ({
      line: index + 2,
      values: Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()])),
    }));

  return { headers, rows, errors };
}

export type RowStatus = "VALID" | "INVALID" | "DUPLICATE";

export interface ValidatedRow<T> {
  line: number;
  status: RowStatus;
  /** Present when status is VALID. */
  value?: T;
  errors: string[];
  raw: Record<string, string>;
}

export interface ValidationSummary<T> {
  rows: ValidatedRow<T>[];
  valid: number;
  invalid: number;
  duplicates: number;
  fileErrors: string[];
}

/**
 * Validate every row, reporting ALL problems rather than stopping at the first.
 *
 * §23 requires a preview showing valid rows, invalid rows, duplicates, and warnings
 * before anything is written. Someone importing 300 customers needs to fix them in one
 * pass — an importer that fails on row 3 and makes them re-upload is one they will stop
 * using, and the workaround is worse than the problem: they will split the file.
 */
export function validateRows<T>(
  parsed: ParseResult,
  required: readonly string[],
  validate: (row: CsvRow) => { ok: true; value: T; key: string } | { ok: false; errors: string[] },
): ValidationSummary<T> {
  const fileErrors = [...parsed.errors];

  const missing = required.filter((column) => !parsed.headers.includes(column));
  if (missing.length > 0) {
    fileErrors.push(`Missing required column(s): ${missing.join(", ")}.`);
  }

  // A missing column is a file-level problem: every row would report the same error, and
  // three hundred identical messages hide the one fact that matters.
  if (fileErrors.length > 0) {
    return { rows: [], valid: 0, invalid: 0, duplicates: 0, fileErrors };
  }

  const seen = new Set<string>();
  const rows: ValidatedRow<T>[] = parsed.rows.map((row) => {
    const result = validate(row);

    if (!result.ok) {
      return { line: row.line, status: "INVALID", errors: result.errors, raw: row.values };
    }

    // Duplicates WITHIN the file. A row that collides with existing data is a different
    // problem, detected at import time, because only the database can answer it.
    if (seen.has(result.key)) {
      return {
        line: row.line,
        status: "DUPLICATE",
        errors: [`Appears more than once in this file (${result.key}).`],
        raw: row.values,
      };
    }

    seen.add(result.key);
    return { line: row.line, status: "VALID", value: result.value, errors: [], raw: row.values };
  });

  return {
    rows,
    valid: rows.filter((r) => r.status === "VALID").length,
    invalid: rows.filter((r) => r.status === "INVALID").length,
    duplicates: rows.filter((r) => r.status === "DUPLICATE").length,
    fileErrors: [],
  };
}

/**
 * Render a CSV for download.
 *
 * Quotes any value containing a comma, quote, or newline, and doubles embedded quotes.
 *
 * Also neutralises FORMULA INJECTION: a value beginning `=`, `+`, `-`, or `@` is treated
 * as a formula by Excel and Sheets, so a customer whose note reads
 * `=HYPERLINK("http://evil","click")` becomes a live link in whatever a consultant
 * opens the export with. Prefixing a tab defuses it while displaying identically.
 */
export function toCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    let text = value === null || value === undefined ? "" : String(value);

    if (/^[=+\-@\t\r]/.test(text)) text = `\t${text}`;

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }

  // CRLF: the line ending Excel expects, and harmless everywhere else.
  return lines.join("\r\n");
}

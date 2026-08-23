import { parseCsv, validateRows, type CsvRow, type ValidationSummary } from "./csv";

import type { ImportCandidate } from "@/server/repositories/member-import";

/**
 * Turning a spreadsheet into members (Phase 13, §23).
 *
 * PURE. No database, no session, no `fetch`. The whole point of the preview step is that
 * an operator sees exactly what would happen before anything is written, and that is only
 * trustworthy if the preview and the import agree — so the classification of every row
 * happens here, once, and the import consumes the result rather than re-deciding.
 *
 * The one thing this cannot know is which emails already exist in the organization. That
 * answer lives in the database and is reported after the import, not before: checking it
 * during the preview would be a lie the moment someone else adds a member in between.
 */

export const IMPORT_COLUMNS = {
  required: ["email", "full_name"] as const,
  optional: ["phone", "locale"] as const,
};

/** The header row of the template an operator downloads. */
export const IMPORT_TEMPLATE_HEADERS = [
  ...IMPORT_COLUMNS.required,
  ...IMPORT_COLUMNS.optional,
];

/**
 * Deliberately loose.
 *
 * Address validation is a well-known trap: every "correct" regex rejects addresses that
 * genuinely deliver, and the real proof is the activation email, which this product
 * already sends. So this rejects what is obviously not an address and lets the rest
 * through, rather than telling someone their working address is invalid.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Locales the product has catalogues for. An unknown one would render as English. */
const LOCALES = new Set(["en", "hi", "te"]);

function validateMemberRow(
  row: CsvRow,
): { ok: true; value: ImportCandidate; key: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const email = (row.values.email ?? "").trim().toLowerCase();
  const fullName = (row.values.full_name ?? "").trim();
  const phone = (row.values.phone ?? "").trim();
  const locale = (row.values.locale ?? "").trim().toLowerCase() || "en";

  if (!email) {
    errors.push("Email is required.");
  } else if (!EMAIL.test(email)) {
    errors.push(`"${email}" does not look like an email address.`);
  }

  if (!fullName) {
    errors.push("Full name is required.");
  } else if (fullName.length > 200) {
    errors.push("Full name is longer than 200 characters.");
  }

  if (phone && phone.length > 40) {
    errors.push("Phone number is longer than 40 characters.");
  }

  if (!LOCALES.has(locale)) {
    errors.push(`"${locale}" is not a supported language. Use ${[...LOCALES].join(", ")}.`);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { email, fullName, phone: phone || null, locale },
    // Lower-cased email is the identity key, matching `users_email_unique_per_org`. Two
    // rows differing only in case are the same person, and the database would agree.
    key: email,
  };
}

/** Parse and classify a whole file. Every problem is reported, never just the first. */
export function previewMemberImport(text: string): ValidationSummary<ImportCandidate> {
  return validateRows(parseCsv(text), IMPORT_COLUMNS.required, validateMemberRow);
}

/**
 * The rows that would actually be inserted.
 *
 * Derived from the same summary the operator saw. Recomputing it from the file at import
 * time would let the two diverge — the classic import bug where the preview says 297 and
 * 298 land, because one code path trims and the other does not.
 */
export function candidatesFrom(
  summary: ValidationSummary<ImportCandidate>,
): ImportCandidate[] {
  return summary.rows
    .filter((row) => row.status === "VALID" && row.value)
    .map((row) => row.value!);
}

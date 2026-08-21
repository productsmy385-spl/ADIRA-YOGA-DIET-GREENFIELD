/**
 * Deciding *what* to migrate, separated from actually doing it.
 *
 * Everything here is pure: given a directory listing and a set of already-applied
 * records, it works out the order, the checksums, and what is still pending. That
 * separation is what lets `migration-plan.test.mjs` cover the ordering and idempotency
 * rules without a PostgreSQL instance — which matters, because the ordering rule is
 * exactly the kind of thing that is obviously correct right up until a file is named
 * `10_foo.sql` and sorts before `9_bar.sql`.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Short, stable content fingerprint. Truncated because it is for change detection. */
export function checksum(contents) {
  return createHash("sha256").update(contents, "utf8").digest("hex").slice(0, 16);
}

/**
 * Migration filenames must be `NNN_description.sql` with a zero-padded numeric prefix.
 *
 * The padding is what makes lexical order equal numeric order. Enforcing the shape here
 * means a badly named file is a loud error at migrate time rather than a silent
 * reordering that applies migration 10 before migration 9.
 */
export const MIGRATION_FILENAME = /^(\d{3,})_[a-z0-9_]+\.sql$/;

export function readMigrations(directory) {
  if (!existsSync(directory)) return [];

  const filenames = readdirSync(directory).filter((name) => name.endsWith(".sql"));

  const malformed = filenames.filter((name) => !MIGRATION_FILENAME.test(name));
  if (malformed.length > 0) {
    throw new Error(
      `Migration filenames must look like 001_description.sql:\n` +
        malformed.map((f) => `  - ${f}`).join("\n"),
    );
  }

  const migrations = filenames.sort().map((filename) => {
    const contents = readFileSync(join(directory, filename), "utf8");
    return { filename, contents, checksum: checksum(contents) };
  });

  const duplicates = findDuplicateSequences(migrations);
  if (duplicates.length > 0) {
    throw new Error(
      `Two migrations share a sequence number, so their order is ambiguous:\n` +
        duplicates.map((d) => `  - ${d}`).join("\n"),
    );
  }

  return migrations;
}

function findDuplicateSequences(migrations) {
  const seen = new Map();
  const duplicates = [];

  for (const { filename } of migrations) {
    const sequence = filename.match(MIGRATION_FILENAME)[1];
    const existing = seen.get(sequence);
    if (existing) {
      duplicates.push(`${sequence}: ${existing}, ${filename}`);
    } else {
      seen.set(sequence, filename);
    }
  }

  return duplicates;
}

/**
 * Refuse to proceed if an applied migration no longer matches what is on disk.
 *
 * Migrations are forward-only. Editing one that has already run means the database and
 * the repository disagree about what the schema is — and because each environment
 * applied the older version at a different time, they will each have diverged
 * differently. Catching it here turns a silent, environment-specific drift into one
 * clear error.
 *
 * @param applied Map of filename -> checksum recorded in schema_migrations
 */
export function verifyChecksums(migrations, applied) {
  const drifted = migrations
    .filter((m) => applied.has(m.filename) && applied.get(m.filename) !== m.checksum)
    .map((m) => m.filename);

  if (drifted.length > 0) {
    throw new Error(
      `Applied migrations have been modified on disk:\n` +
        drifted.map((f) => `  - ${f}`).join("\n") +
        `\n\nMigrations are forward-only. Restore these files to their applied contents ` +
        `and express the change as a new migration instead.`,
    );
  }
}

/**
 * What still needs applying, in order.
 *
 * Idempotency lives here: a migration recorded in `applied` is never returned again, so
 * running the migrator twice applies nothing the second time.
 */
export function pendingMigrations(migrations, applied) {
  return migrations.filter((m) => !applied.has(m.filename));
}

import { describe, expect, it } from "vitest";

import { PG_ENUMS } from "@/server/db/types";

import { getTestPool, hasTestDatabase } from "./helpers/sql-db";

/**
 * The TypeScript enum mirrors in `src/server/db/types.ts` must match the PostgreSQL
 * types they claim to mirror.
 *
 * This is the guard for a drift TaskFlow HR actually suffered: `UserStatus` was missing
 * `LOCKED` for the entire life of one migration, while the auth adapter was already
 * casting to `'LOCKED'::user_status`. Nothing caught it, because a hand-written union
 * that is merely *incomplete* still typechecks.
 *
 * Skipped without a test database so a contributor lacking one still gets a green suite;
 * CI always has one, so drift cannot reach main.
 */
const describeWithDatabase = hasTestDatabase ? describe : describe.skip;

describeWithDatabase("PostgreSQL enum parity", () => {
  it("declares every enum this codebase mirrors", async () => {
    const pool = getTestPool();

    const { rows } = await pool.query<{ typname: string }>(
      `SELECT t.typname
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'e' AND n.nspname = 'public'`,
    );

    const inDatabase = new Set(rows.map((row) => row.typname));
    const mirrored = Object.keys(PG_ENUMS);

    // Every mirror must correspond to a real type. A mirror of a type that no longer
    // exists is dead code pretending to be a contract.
    for (const name of mirrored) {
      expect(inDatabase, `PG_ENUMS mirrors "${name}" but no such type exists`).toContain(name);
    }

    // And every real enum must be mirrored, so a new one cannot be added to the schema
    // without also being brought under this test's protection.
    for (const name of inDatabase) {
      expect(
        mirrored,
        `Enum "${name}" exists in the database but is not listed in PG_ENUMS`,
      ).toContain(name);
    }
  });

  it.each(Object.entries(PG_ENUMS))(
    "mirrors every label of %s exactly",
    async (typeName, expectedValues) => {
      const pool = getTestPool();

      const { rows } = await pool.query<{ label: string }>(
        `SELECT e.enumlabel AS label
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1
          ORDER BY e.enumsortorder`,
        [typeName],
      );

      const actual = rows.map((row) => row.label);

      // Compared as sets: declaration order in SQL is meaningful to PostgreSQL for
      // ordering comparisons, but the TypeScript union carries no order, so requiring
      // the arrays to match positionally would fail for a difference that means nothing.
      expect(new Set(actual)).toEqual(new Set(expectedValues));
    },
  );
});

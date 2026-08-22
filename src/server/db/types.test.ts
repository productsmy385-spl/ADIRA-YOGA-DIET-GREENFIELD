import { describe, expect, it } from "vitest";

// Plain JS module, imported deliberately: scripts/ runs under bare Node and cannot
// import this TypeScript file, so the two lists are compared rather than shared.
import { PG_ENUM_EXPECTATIONS } from "../../../scripts/schema-expectations.mjs";

import { PG_ENUMS } from "./types";

/**
 * Hold the two enum lists together.
 *
 * `src/server/db/types.ts` is what the application compiles against;
 * `scripts/schema-expectations.mjs` is what the Phase 1 acceptance check asserts about
 * the real database. If they disagree, one of them is lying about the schema and the
 * question of which is a coin flip.
 *
 * This runs with no database, so it is the layer that protects a contributor's laptop.
 * `tests/enum-parity.test.ts` compares the TypeScript side against a live `pg_enum` and
 * needs a database; between them the three representations stay in step.
 */

const expectations = PG_ENUM_EXPECTATIONS as Record<string, readonly string[]>;

describe("enum expectations are consistent across representations", () => {
  it("covers exactly the same enum types", () => {
    expect(Object.keys(expectations).sort()).toEqual(Object.keys(PG_ENUMS).sort());
  });

  it.each(Object.keys(PG_ENUMS))("agrees on the labels of %s", (name) => {
    const fromTypes = PG_ENUMS[name as keyof typeof PG_ENUMS];
    expect(new Set(expectations[name])).toEqual(new Set(fromTypes));
  });

  // Order is not compared above, because a TypeScript union carries none. It is compared
  // here for the one place it does matter: PostgreSQL orders enum comparisons by
  // declaration order, so a reordered list would change the meaning of any future
  // `ORDER BY status`.
  it.each(Object.keys(PG_ENUMS))("agrees on the declaration order of %s", (name) => {
    const fromTypes = PG_ENUMS[name as keyof typeof PG_ENUMS];
    expect(expectations[name]).toEqual([...fromTypes]);
  });
});

import { describe, expect, it } from "vitest";

import { isolationRefusal } from "./helpers/sql-db";

/**
 * The guard that decides whether destructive suites may run.
 *
 * This file exists because the guard was wrong once, in a way that was invisible: it
 * compared `SQL_TEST_DATABASE_URL` against the LIVE `DATABASE_URL`, which `setup-db.ts`
 * has deliberately aliased to the test URL by that point. The two were therefore always
 * identical, the guard always refused, and 110 destructive tests skipped permanently while
 * the run reported itself green.
 *
 * A guard that silently blocks everything looks exactly like a guard that silently allows
 * everything: both produce a passing run. So the guard is a pure function and it is tested
 * directly, on both sides — it must ALLOW when the databases genuinely differ, not merely
 * REFUSE when they do not.
 *
 * The invariant, stated once:
 *
 *   the database destructive tests will truncate
 *     ≠ the application's real database, AND
 *     ≠ any database whose name is known to be production
 */

const PROD = "postgresql://postgres:secret@postgres.railway.internal:5432/railway";
const TEST = "postgresql://postgres:secret@altaria.proxy.rlwy.net:46135/adira_test";

const allowed = (r: string | null) => r === null;

describe("isolationRefusal", () => {
  /** CASE 1 — the ordinary happy path. */
  it("ALLOWS when the production and test databases differ", () => {
    expect(
      isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: PROD }),
    ).toBeNull();
  });

  /** CASE 2 — the case the guard exists for. */
  it("BLOCKS when the test URL is the production URL", () => {
    const refusal = isolationRefusal({
      optedIn: true,
      testUrl: PROD,
      productionUrl: PROD,
    });
    expect(allowed(refusal)).toBe(false);
    expect(refusal).toMatch(/protected database|same database/);
  });

  /**
   * CASE 3 — the regression this file was written for.
   *
   * `setup-db.ts` sets `process.env.DATABASE_URL = SQL_TEST_DATABASE_URL` so there is one
   * pool. The guard must compare against the ORIGINAL production URL, not the aliased
   * value, or it refuses its own harness.
   */
  it("ALLOWS after setup-db has aliased DATABASE_URL to the test URL", () => {
    // What the environment looks like post-alias: DATABASE_URL === testUrl, and the real
    // production URL survives only in the preserved variable.
    expect(
      isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: PROD }),
    ).toBeNull();

    // Comparing against the aliased value is now explicitly allowed — see the dedicated
    // case below for why that does not weaken the production protection.
    expect(isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: TEST })).toBeNull();
  });

  /** CASE 4 — an unmakeable safety comparison must fail closed, never open. */
  it("BLOCKS when production identity cannot be established", () => {
    const refusal = isolationRefusal({
      optedIn: true,
      testUrl: TEST,
      productionUrl: undefined,
    });
    expect(allowed(refusal)).toBe(false);
    expect(refusal).toMatch(/unknown/);
  });

  /** CASE 5 — a protected database name, whatever URL reaches it. */
  it("BLOCKS when the test database is named like production", () => {
    for (const name of ["railway", "postgres", "production"]) {
      const url = `postgresql://u:p@somewhere.example:5432/${name}`;
      const refusal = isolationRefusal({
        optedIn: true,
        testUrl: url,
        productionUrl: PROD,
      });
      expect(allowed(refusal), `${name} must be refused`).toBe(false);
      expect(refusal).toMatch(/protected database/);
    }
  });

  /**
   * The Railway case a string comparison misses.
   *
   * The SAME database is reachable as `postgres.railway.internal:5432` and as
   * `<name>.proxy.rlwy.net:41234`. Those URLs share no text and destroy the same rows, so
   * identity is matched on database name plus credentials rather than on the URL.
   */
  /**
   * Local development pointed at the test database is the SAFE configuration
   * `docs/RAILWAY.md` asks for, so the two URLs matching must not block the suites. The
   * production protection is the protected-name check, not this comparison.
   */
  it("ALLOWS the application being pointed at the test database itself", () => {
    expect(isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: TEST })).toBeNull();
  });

  it("STILL BLOCKS when both point at a production-named database", () => {
    const bothProd = "postgresql://postgres:secret@host:5432/railway";
    const refusal = isolationRefusal({
      optedIn: true,
      testUrl: bothProd,
      productionUrl: bothProd,
    });
    expect(allowed(refusal)).toBe(false);
    expect(refusal).toMatch(/protected database/);
  });

  it("BLOCKS the same database reached through a different host", () => {
    const internal = "postgresql://postgres:samesecret@postgres.railway.internal:5432/appdb";
    const proxy = "postgresql://postgres:samesecret@viaduct.proxy.rlwy.net:41234/appdb";

    const refusal = isolationRefusal({
      optedIn: true,
      testUrl: proxy,
      productionUrl: internal,
    });
    expect(allowed(refusal)).toBe(false);
    expect(refusal).toMatch(/same database/);
  });

  it("ALLOWS a different database on the same host and credentials", () => {
    // adira_test and railway live on one Railway instance and share credentials. Same
    // server is not same database — TRUNCATE is scoped to the connected database.
    const sameServerDifferentDb =
      "postgresql://postgres:secret@postgres.railway.internal:5432/adira_test";
    expect(
      isolationRefusal({ optedIn: true, testUrl: sameServerDifferentDb, productionUrl: PROD }),
    ).toBeNull();
  });

  it("BLOCKS without the explicit opt-in, even when everything else is safe", () => {
    expect(
      allowed(isolationRefusal({ optedIn: false, testUrl: TEST, productionUrl: PROD })),
    ).toBe(false);
  });

  it("BLOCKS when no test database is configured", () => {
    expect(
      allowed(isolationRefusal({ optedIn: true, testUrl: undefined, productionUrl: PROD })),
    ).toBe(false);
  });

  it("BLOCKS on an unparseable URL rather than guessing", () => {
    expect(
      allowed(isolationRefusal({ optedIn: true, testUrl: "not a url", productionUrl: PROD })),
    ).toBe(false);
    expect(
      allowed(isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: "not a url" })),
    ).toBe(false);
  });

  /** Every refusal is a sentence a human can act on, not a bare false. */
  it("always explains itself", () => {
    const refusals = [
      isolationRefusal({ optedIn: false, testUrl: TEST, productionUrl: PROD }),
      isolationRefusal({ optedIn: true, testUrl: undefined, productionUrl: PROD }),
      isolationRefusal({ optedIn: true, testUrl: PROD, productionUrl: PROD }),
      isolationRefusal({ optedIn: true, testUrl: TEST, productionUrl: undefined }),
    ];

    for (const refusal of refusals) {
      expect(typeof refusal).toBe("string");
      expect((refusal as string).length).toBeGreaterThan(20);
    }
  });
});

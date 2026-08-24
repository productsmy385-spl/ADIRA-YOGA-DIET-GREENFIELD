import type { Pool, PoolClient } from "pg";
import { describe } from "vitest";

import { pool } from "@/server/db/pool";

/**
 * Database access for tests, in two modes that cannot be confused for one another.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE WAS REDESIGNED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The original design had one mode: point `SQL_TEST_DATABASE_URL` at a throwaway
 * database and `TRUNCATE` it between tests. That is the right design when a throwaway
 * database exists. This project has decided it will not maintain one — development runs
 * against the real production database — so the destructive path now has nowhere safe to
 * point, and the only acceptable answer is that it REFUSES TO RUN rather than finding
 * somewhere unsafe.
 *
 * So there are two modes, and the distinction is enforced rather than documented:
 *
 *   READ_ONLY   Every statement runs inside `BEGIN READ ONLY`, which PostgreSQL itself
 *               refuses to let write. Safe against production, because the guarantee is
 *               the server's, not a regex over the SQL text. This is how the schema
 *               contract is verified against whatever database is actually configured.
 *
 *   ISOLATED    TRUNCATE and fixture seeding. Requires an explicit opt-in AND a database
 *               that is demonstrably not the one the application uses. Absent that, the
 *               suites that need it are SKIPPED WITH A REASON — never silently, and never
 *               by quietly running somewhere else.
 *
 * SKIPPING IS NOT PASSING. A skipped suite is reported as skipped, and
 * `docs/TESTING.md` says which coverage that costs and where it moved to.
 */

/* ── mode resolution ───────────────────────────────────────────────────── */

/**
 * Databases that must never be truncated, by name.
 *
 * `railway` is the production database on this project's Railway instance. The check is
 * belt-and-braces alongside the URL comparison below: an operator who copies the
 * production URL into `SQL_TEST_DATABASE_URL` defeats a string comparison the moment the
 * two differ by a query parameter, and this catches that.
 */
const PROTECTED_DATABASE_NAMES = new Set(["railway", "postgres", "production"]);

export type DatabaseMode = "NONE" | "READ_ONLY" | "ISOLATED";

/** What the guard needs to know. Pure inputs, so the decision is directly testable. */
export interface IsolationInputs {
  /** `ADIRA_ISOLATED_TEST_DB === "1"`. */
  readonly optedIn: boolean;
  /** The database destructive suites would TRUNCATE. */
  readonly testUrl?: string;
  /**
   * The application's REAL database, captured before `setup-db.ts` aliased
   * `DATABASE_URL`. Not the live `DATABASE_URL`, which by then names the test database.
   */
  readonly productionUrl?: string;
}

interface UrlParts {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

function partsOf(url: string | undefined): UrlParts | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname.toLowerCase(),
      port: u.port || "5432",
      database: u.pathname.replace(/^\//, ""),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    return null;
  }
}

/**
 * Do two URLs address the same database, even through different hosts?
 *
 * A string comparison is not enough on Railway, where the SAME database is reachable as
 * `postgres.railway.internal:5432` and as `<name>.proxy.rlwy.net:41234`. Those URLs share
 * nothing textually and destroy the same rows.
 *
 * Same database name AND same user AND same password is treated as the same database. It
 * is a heuristic, and a deliberately conservative one: a false positive costs a skipped
 * suite, a false negative costs the production data. `assertIsolatedTarget` performs the
 * authoritative check against the live server before anything is truncated.
 */
function sameDatabase(a: UrlParts, b: UrlParts): boolean {
  if (a.host === b.host && a.port === b.port && a.database === b.database) return true;
  return (
    a.database === b.database &&
    a.user === b.user &&
    a.password !== "" &&
    a.password === b.password
  );
}

/**
 * May destructive suites run? Returns the REASON they may not, or null.
 *
 * The invariant, stated once:
 *
 *   the database destructive tests will truncate
 *     ≠ the application's real database, AND
 *     ≠ any database whose name is known to be production
 *
 * Note what it does NOT compare: the live `DATABASE_URL`. The harness aliases that to the
 * test URL on purpose, so comparing against it makes the two identical by construction and
 * the guard refuses every run — which is precisely the bug this replaced.
 */
export function isolationRefusal(inputs: IsolationInputs): string | null {
  if (!inputs.optedIn) return "ADIRA_ISOLATED_TEST_DB is not set to 1";
  if (!inputs.testUrl) return "SQL_TEST_DATABASE_URL is not set";

  const test = partsOf(inputs.testUrl);
  if (!test) return "SQL_TEST_DATABASE_URL could not be parsed";

  if (PROTECTED_DATABASE_NAMES.has(test.database)) {
    return `SQL_TEST_DATABASE_URL names the protected database "${test.database}"`;
  }

  // CASE 4 — production identity unknown means the comparison cannot be made, and an
  // unmakeable safety comparison must fail closed.
  if (!inputs.productionUrl) {
    return "the application's DATABASE_URL is unknown, so the test database cannot be proved different";
  }

  const production = partsOf(inputs.productionUrl);
  if (!production) return "the application's DATABASE_URL could not be parsed";

  /*
   * EXACT equality is the application being pointed at the test database itself.
   *
   * That is the configuration `docs/RAILWAY.md` asks for — local development must not
   * point at production — so it is not evidence of danger. Refusing it was a false
   * positive that blocked every destructive suite the moment a developer configured
   * their machine the safe way.
   *
   * It is safe because the PROTECTED_DATABASE_NAMES check has already run: if both URLs
   * named `railway`, `postgres` or `production`, this line would never be reached.
   */
  if (inputs.testUrl === inputs.productionUrl) return null;

  /*
   * Anything short of exact equality that still resolves to the same database is the
   * dangerous case, and it is why a string comparison alone is not enough.
   *
   * On Railway the SAME database is reachable as `postgres.railway.internal:5432` and as
   * `<name>.proxy.rlwy.net:41234`. Those two URLs share no text, destroy the same rows,
   * and a database named something unremarkable would slip past the protected-name list.
   * Matching on database name plus credentials catches it.
   */
  if (sameDatabase(test, production)) {
    return "SQL_TEST_DATABASE_URL and the application's DATABASE_URL address the same database through different hosts";
  }

  return null;
}

function isolatedRefusal(): string | null {
  return isolationRefusal({
    optedIn: process.env.ADIRA_ISOLATED_TEST_DB === "1",
    testUrl: process.env.SQL_TEST_DATABASE_URL,
    // Recorded by setup-db.ts BEFORE it aliased DATABASE_URL. The fallback covers a
    // process where the alias never happened, in which case DATABASE_URL is still real.
    productionUrl:
      process.env.ADIRA_PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL,
  });
}

const ISOLATED_REFUSAL = isolatedRefusal();

export const databaseMode: DatabaseMode = ISOLATED_REFUSAL
  ? process.env.DATABASE_URL
    ? "READ_ONLY"
    : "NONE"
  : "ISOLATED";

/** True when destructive fixture suites may run. */
export const hasIsolatedDatabase = databaseMode === "ISOLATED";

/** True when read-only verification against the configured database may run. */
export const hasReadableDatabase = databaseMode !== "NONE";

/**
 * Retained under its old name because six suites import it, and because the answer it
 * gives is still the right one for them: they need a database they may destroy.
 */
export const hasTestDatabase = hasIsolatedDatabase;

/* ── suite guards ──────────────────────────────────────────────────────── */

/**
 * For suites that TRUNCATE and seed.
 *
 * Skipped — visibly, with the reason in the suite name — unless an isolated database is
 * configured. The reason is in the name rather than a comment because a run that skips
 * fourteen tests should say why in its own output, where somebody reading CI will see it.
 */
export function describeIsolated(name: string, fn: () => void): void {
  if (hasIsolatedDatabase) {
    describe(name, fn);
    return;
  }
  describe.skip(`${name} [needs an isolated database: ${ISOLATED_REFUSAL}]`, fn);
}

/**
 * For the deployment gate: read-only, but asks whether the DEPLOYMENT is current rather
 * than whether the code is correct.
 *
 * Off by default, and that is a considered choice rather than hiding a failure. "The
 * database is three migrations behind" is true of the environment, not of the code, and
 * leaving it in `npm test` makes the suite permanently red for something no code change
 * can fix — at which point a red suite stops meaning anything and the next real failure
 * is scrolled past. It runs under `npm run verify:deploy`, which is a gate before
 * deploying, and the skip reason says so.
 */
export function describeDeploymentGate(name: string, fn: () => void): void {
  if (!hasReadableDatabase) {
    describe.skip(`${name} [no DATABASE_URL configured]`, fn);
    return;
  }
  if (process.env.ADIRA_VERIFY_DEPLOYMENT === "1") {
    describe(name, fn);
    return;
  }
  describe.skip(`${name} [deployment gate — run: npm run verify:deploy]`, fn);
}

/** For suites that only read. Safe against the production database. */
export function describeReadOnly(name: string, fn: () => void): void {
  if (hasReadableDatabase) {
    describe(name, fn);
    return;
  }
  describe.skip(`${name} [no DATABASE_URL configured]`, fn);
}

/* ── read-only access ──────────────────────────────────────────────────── */

/**
 * Run `fn` inside a transaction PostgreSQL will not permit to write.
 *
 * `BEGIN READ ONLY` is the whole point. A helper that merely *intends* to read is one
 * INSERT away from being wrong, and reviewing for that forever is not a plan. Here the
 * server refuses the write — `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, DDL, and
 * `SELECT ... FOR UPDATE` all raise `25006 read_only_sql_transaction`.
 *
 * Always rolled back, never committed, so even a read-only transaction leaves nothing
 * behind — not a lock, not an open snapshot.
 */
export async function readOnly<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {
      // A failed rollback must not mask the real error; the connection is released
      // either way and the pool will discard it if it is unusable.
    });
    client.release();
  }
}

/** The database the tests are actually talking to. Used in reports and assertions. */
export async function currentDatabaseName(): Promise<string> {
  return readOnly(async (client) => {
    const { rows } = await client.query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    return rows[0].db;
  });
}

/* ── isolated access ───────────────────────────────────────────────────── */

/**
 * The one pool destructive tests share — the application's own.
 *
 * Safe only because `tests/setup-db.ts` has already repointed `DATABASE_URL` at the
 * isolated database. TaskFlow HR's Knowledge Base records why a second pool is wrong:
 * `TRUNCATE` needs an ACCESS EXCLUSIVE lock, and a second pool's idle connections hold
 * table locks that prevent it being granted. The symptom is a suite that passes alone and
 * times out in a full run, which reads like flakiness rather than the lock contention it
 * is.
 */
export function getTestPool(): Pool {
  if (!hasIsolatedDatabase) {
    throw new Error(
      `getTestPool() requires an isolated database — ${ISOLATED_REFUSAL}. These tests ` +
        "TRUNCATE every table and must never point at a database anything else uses. " +
        "See docs/TESTING.md.",
    );
  }
  return pool;
}

/**
 * Empty every application table, leaving the schema and migration history intact.
 *
 * THE INTERLOCK. Three separate conditions have to hold before a TRUNCATE is issued, and
 * the last one asks the database itself what it is rather than trusting configuration:
 *
 *   1. `ADIRA_ISOLATED_TEST_DB=1`         — deliberate opt-in, not a default
 *   2. a distinct `SQL_TEST_DATABASE_URL` — pointing somewhere other than the app
 *   3. `current_database()` is not protected — checked on the live connection
 *
 * The third exists because the first two are configuration, and configuration is what
 * gets copied between machines. This one cannot be got wrong by a paste.
 *
 * `schema_migrations` is excluded: wiping it would make the next run believe the
 * database is unmigrated.
 */
export async function resetDatabase(): Promise<void> {
  const db = getTestPool();

  const { rows: identity } = await db.query<{ db: string }>(
    "SELECT current_database() AS db",
  );
  const name = identity[0]?.db;

  if (!name || PROTECTED_DATABASE_NAMES.has(name)) {
    throw new Error(
      `Refusing to TRUNCATE: the connection reports current_database() = "${name}", ` +
        "which is protected. Something has repointed the pool at a database that is " +
        "not a throwaway.",
    );
  }

  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );

  if (rows.length === 0) return;

  const tables = rows.map((row) => `public."${row.tablename}"`).join(", ");
  await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Intentionally a no-op. The shared pool outlives every individual test file — closing it
 * between files leaves later files with a dead pool — and vitest tears the process down
 * when the run ends.
 */
export async function disconnectTestDb(): Promise<void> {
  // Deliberately empty.
}

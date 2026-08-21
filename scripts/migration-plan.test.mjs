import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checksum,
  pendingMigrations,
  readMigrations,
  verifyChecksums,
} from "./migration-plan.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "adira-migrations-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(filename, contents = `-- ${filename}\nSELECT 1;\n`) {
  writeFileSync(join(dir, filename), contents, "utf8");
}

describe("readMigrations", () => {
  it("returns migrations in ascending sequence order", () => {
    write("003_third.sql");
    write("001_first.sql");
    write("002_second.sql");

    expect(readMigrations(dir).map((m) => m.filename)).toEqual([
      "001_first.sql",
      "002_second.sql",
      "003_third.sql",
    ]);
  });

  // The reason filenames are required to be zero-padded. Unpadded, "10" sorts before
  // "9" lexically, and migration 10 would be applied before migration 9 — silently,
  // and differently depending on how many migrations exist.
  it("keeps ordering correct past the ten-file boundary", () => {
    write("009_ninth.sql");
    write("010_tenth.sql");
    write("011_eleventh.sql");

    expect(readMigrations(dir).map((m) => m.filename)).toEqual([
      "009_ninth.sql",
      "010_tenth.sql",
      "011_eleventh.sql",
    ]);
  });

  it("rejects a filename that does not carry a zero-padded sequence", () => {
    write("9_unpadded.sql");
    expect(() => readMigrations(dir)).toThrowError(/001_description\.sql/);
  });

  it("rejects a filename with uppercase or spaces", () => {
    write("004_Bad Name.sql");
    expect(() => readMigrations(dir)).toThrowError(/Bad Name/);
  });

  it("rejects two migrations sharing a sequence number", () => {
    write("005_alpha.sql");
    write("005_beta.sql");

    expect(() => readMigrations(dir)).toThrowError(/share a sequence number/);
  });

  it("ignores non-SQL files", () => {
    write("001_first.sql");
    writeFileSync(join(dir, "README.md"), "notes", "utf8");

    expect(readMigrations(dir)).toHaveLength(1);
  });

  it("returns an empty list for a directory that does not exist", () => {
    expect(readMigrations(join(dir, "absent"))).toEqual([]);
  });
});

describe("checksum", () => {
  it("is stable for identical content and differs for changed content", () => {
    expect(checksum("SELECT 1;")).toBe(checksum("SELECT 1;"));
    expect(checksum("SELECT 1;")).not.toBe(checksum("SELECT 2;"));
  });
});

describe("verifyChecksums", () => {
  it("accepts migrations whose applied checksum still matches", () => {
    write("001_first.sql");
    const migrations = readMigrations(dir);
    const applied = new Map([["001_first.sql", migrations[0].checksum]]);

    expect(() => verifyChecksums(migrations, applied)).not.toThrow();
  });

  // Forward-only means an applied file is frozen. Editing one is the mistake this check
  // exists to make loud.
  it("rejects an applied migration that has since been edited", () => {
    write("001_first.sql");
    const migrations = readMigrations(dir);
    const applied = new Map([["001_first.sql", "0000000000000000"]]);

    expect(() => verifyChecksums(migrations, applied)).toThrowError(
      /modified on disk[\s\S]*001_first\.sql/,
    );
  });

  it("ignores checksum drift for migrations that were never applied", () => {
    write("001_first.sql");
    const migrations = readMigrations(dir);

    expect(() => verifyChecksums(migrations, new Map())).not.toThrow();
  });
});

describe("pendingMigrations", () => {
  it("returns everything when nothing has been applied", () => {
    write("001_first.sql");
    write("002_second.sql");
    const migrations = readMigrations(dir);

    expect(pendingMigrations(migrations, new Map())).toHaveLength(2);
  });

  it("returns only the unapplied tail, preserving order", () => {
    write("001_first.sql");
    write("002_second.sql");
    write("003_third.sql");
    const migrations = readMigrations(dir);
    const applied = new Map([["001_first.sql", migrations[0].checksum]]);

    expect(pendingMigrations(migrations, applied).map((m) => m.filename)).toEqual([
      "002_second.sql",
      "003_third.sql",
    ]);
  });

  // Idempotency: a second run applies nothing.
  it("returns nothing once every migration is recorded as applied", () => {
    write("001_first.sql");
    write("002_second.sql");
    const migrations = readMigrations(dir);
    const applied = new Map(migrations.map((m) => [m.filename, m.checksum]));

    expect(pendingMigrations(migrations, applied)).toEqual([]);
  });
});

describe("the repository's own migrations", () => {
  // Guards the real directory, not a fixture: if someone adds a badly named migration,
  // this fails in CI rather than at deploy time.
  it("are all well-formed and unambiguously ordered", () => {
    const repoMigrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const migrations = readMigrations(repoMigrations);

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].filename).toBe("001_foundation.sql");
  });
});

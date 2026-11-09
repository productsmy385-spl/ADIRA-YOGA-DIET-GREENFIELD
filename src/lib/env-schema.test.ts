import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env-schema";

const SECRET_A = "a".repeat(32);
const SECRET_B = "b".repeat(32);
const SECRET_C = "c".repeat(32);

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://user:pass@host:5432/adira",
    SESSION_SECRET: SECRET_A,
    OWNER_SESSION_SECRET: SECRET_B,
    CRON_SECRET: SECRET_C,
    APP_URL: "https://adira.example",
    CLERK_SECRET_KEY: "sk_test_not-a-real-key",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_not-a-real-key",
    ...overrides,
  };
}

describe("parseServerEnv", () => {
  it("accepts a complete, well-formed environment", () => {
    const env = parseServerEnv(validEnv());

    expect(env.DATABASE_URL).toBe("postgresql://user:pass@host:5432/adira");
    expect(env.NODE_ENV).toBe("test");
  });

  it("defaults NODE_ENV to development when absent", () => {
    expect(parseServerEnv(validEnv({ NODE_ENV: undefined })).NODE_ENV).toBe("development");
  });

  it.each([
    "DATABASE_URL",
    "SESSION_SECRET",
    "OWNER_SESSION_SECRET",
    "CRON_SECRET",
    "APP_URL",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ])("rejects a missing %s and names it in the message", (key) => {
    expect(() => parseServerEnv(validEnv({ [key]: undefined }))).toThrowError(
      new RegExp(`\\b${key}\\b`),
    );
  });

  it("reports every problem at once rather than one per restart", () => {
    let message = "";
    try {
      parseServerEnv({ NODE_ENV: "test" });
    } catch (error) {
      message = (error as Error).message;
    }

    for (const key of ["DATABASE_URL", "SESSION_SECRET", "OWNER_SESSION_SECRET", "CRON_SECRET", "APP_URL"]) {
      expect(message).toContain(key);
    }
  });

  // The error text reaches deploy logs, which are far more widely readable than the
  // secrets themselves. Naming the key is the whole job; echoing the value is a leak.
  it("never echoes a supplied value in the error message", () => {
    const leak = "super-secret-value-that-must-not-appear-anywhere";

    let message = "";
    try {
      parseServerEnv(validEnv({ SESSION_SECRET: "short", DATABASE_URL: leak }));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("SESSION_SECRET");
    expect(message).not.toContain(leak);
    expect(message).not.toContain("short");
  });

  it("rejects a DATABASE_URL that is not a postgres connection string", () => {
    expect(() => parseServerEnv(validEnv({ DATABASE_URL: "mysql://host/db" }))).toThrowError(
      /DATABASE_URL/,
    );
    expect(() => parseServerEnv(validEnv({ DATABASE_URL: "not-a-url" }))).toThrowError(
      /DATABASE_URL/,
    );
  });

  it.each(["SESSION_SECRET", "OWNER_SESSION_SECRET", "CRON_SECRET"])(
    "rejects a %s below 32 characters",
    (key) => {
      expect(() => parseServerEnv(validEnv({ [key]: "too-short" }))).toThrowError(
        new RegExp(`\\b${key}\\b`),
      );
    },
  );

  // ADR-001. Reusing one secret across both identity domains would let a tenant session
  // cookie be re-signed as a platform-owner cookie.
  it("rejects SESSION_SECRET and OWNER_SESSION_SECRET being identical", () => {
    expect(() =>
      parseServerEnv(validEnv({ OWNER_SESSION_SECRET: SECRET_A })),
    ).toThrowError(/OWNER_SESSION_SECRET/);
  });

  it("treats ImageKit keys as optional", () => {
    expect(() => parseServerEnv(validEnv())).not.toThrow();
  });

  // ADR-015: swapping the two Clerk keys is an easy paste mistake, and it must fail at
  // boot rather than surface as a sign-in page that silently never loads.
  it("rejects Clerk keys with the wrong prefix", () => {
    expect(() =>
      parseServerEnv(validEnv({ CLERK_SECRET_KEY: "pk_test_swapped" })),
    ).toThrowError(/CLERK_SECRET_KEY/);
    expect(() =>
      parseServerEnv(validEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_test_swapped" })),
    ).toThrowError(/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  });
});

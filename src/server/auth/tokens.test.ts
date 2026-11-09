import { describe, expect, it } from "vitest";

import {
  generateSessionToken,
  hashSessionToken,
  hashToken,
  safeEqual,
  verifySessionToken,
  verifyToken,
} from "./tokens";

describe("generateSessionToken", () => {
  it("produces a URL-safe token with no padding", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("carries 256 bits of entropy", () => {
    // 32 bytes base64url-encoded is 43 characters.
    expect(generateSessionToken()).toHaveLength(43);
  });

  it("never repeats across many draws", () => {
    const seen = new Set(Array.from({ length: 2000 }, generateSessionToken));
    expect(seen.size).toBe(2000);
  });
});

describe("hashToken", () => {
  it("is deterministic and 32 bytes", () => {
    const a = hashToken("abc");
    expect(a).toEqual(hashToken("abc"));
    expect(a).toHaveLength(32);
  });

  it("differs for different input", () => {
    expect(hashToken("abc")).not.toEqual(hashToken("abd"));
  });

  it("does not contain the plaintext", () => {
    expect(hashToken("supersecret").toString("utf8")).not.toContain("supersecret");
  });
});

describe("safeEqual", () => {
  it("compares equal buffers as equal", () => {
    expect(safeEqual(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
  });

  it("compares differing buffers as unequal", () => {
    expect(safeEqual(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
  });

  // timingSafeEqual throws on length mismatch. Returning false instead is what lets
  // callers pass untrusted input without wrapping every call in try/catch.
  it("returns false rather than throwing on a length mismatch", () => {
    expect(() => safeEqual(Buffer.from("abc"), Buffer.from("abcdef"))).not.toThrow();
    expect(safeEqual(Buffer.from("abc"), Buffer.from("abcdef"))).toBe(false);
    expect(safeEqual(Buffer.alloc(0), Buffer.from("x"))).toBe(false);
  });

  it("treats two empty buffers as equal", () => {
    expect(safeEqual(Buffer.alloc(0), Buffer.alloc(0))).toBe(true);
  });
});

describe("verifyToken", () => {
  it("accepts the token it was derived from", () => {
    const token = generateSessionToken();
    expect(verifyToken(token, hashToken(token))).toBe(true);
  });

  it("rejects any other token", () => {
    const stored = hashToken(generateSessionToken());
    expect(verifyToken(generateSessionToken(), stored)).toBe(false);
  });

  it("rejects an empty presented token", () => {
    const token = generateSessionToken();
    expect(verifyToken("", hashToken(token))).toBe(false);
  });
});

/**
 * The keyed session hash is what makes ADR-001's two identity domains a cryptographic
 * boundary rather than merely two table names. These tests are the boundary.
 */
describe("hashSessionToken / verifySessionToken", () => {
  const TENANT_SECRET = "tenant-secret-at-least-32-characters-long";
  const PLATFORM_SECRET = "platform-secret-at-least-32-characters-long";

  it("verifies a token against its own hash under the same secret", () => {
    const token = generateSessionToken();
    const stored = hashSessionToken(token, TENANT_SECRET);
    expect(verifySessionToken(token, stored, TENANT_SECRET)).toBe(true);
  });

  it("rejects a different token", () => {
    const stored = hashSessionToken(generateSessionToken(), TENANT_SECRET);
    expect(verifySessionToken(generateSessionToken(), stored, TENANT_SECRET)).toBe(false);
  });

  /**
   * THE POINT OF THE WHOLE MECHANISM.
   *
   * A tenant session token must not verify against the platform domain's secret, even
   * though it is the very same token. This is what stops a bug that looks a tenant token
   * up in `owner_sessions` from succeeding — with an unkeyed hash it would have matched.
   */
  it("does not verify a tenant token under the platform secret, or the reverse", () => {
    const token = generateSessionToken();

    const tenantHash = hashSessionToken(token, TENANT_SECRET);
    const platformHash = hashSessionToken(token, PLATFORM_SECRET);

    expect(verifySessionToken(token, tenantHash, PLATFORM_SECRET)).toBe(false);
    expect(verifySessionToken(token, platformHash, TENANT_SECRET)).toBe(false);
  });

  it("produces a different hash per secret for the same token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, TENANT_SECRET).equals(
      hashSessionToken(token, PLATFORM_SECRET),
    )).toBe(false);
  });

  it("is deterministic for one token and secret", () => {
    const token = generateSessionToken();
    expect(
      hashSessionToken(token, TENANT_SECRET).equals(hashSessionToken(token, TENANT_SECRET)),
    ).toBe(true);
  });

  // 32 bytes, matching the bytea column and every other hash in this module.
  it("returns a 32-byte digest", () => {
    expect(hashSessionToken(generateSessionToken(), TENANT_SECRET)).toHaveLength(32);
  });

  // The unkeyed hash must NOT be interchangeable with the keyed one — if it were, the
  // domain separation could be bypassed by calling the wrong helper.
  it("never equals the unkeyed hashToken digest", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token, TENANT_SECRET).equals(hashToken(token))).toBe(false);
  });
});

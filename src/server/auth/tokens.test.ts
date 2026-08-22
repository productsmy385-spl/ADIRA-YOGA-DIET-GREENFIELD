import { describe, expect, it } from "vitest";

import {
  generateOtpCode,
  generateSessionToken,
  hashOtpCode,
  hashToken,
  safeEqual,
  verifyOtpCode,
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

describe("generateOtpCode", () => {
  it("is always exactly six digits, including when the value is small", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  // Zero-padding is the case a naive implementation gets wrong: String(42) is "42",
  // which is a five-character-shorter code and a broken fixed-width input.
  it("zero-pads rather than emitting a short code", () => {
    const codes = Array.from({ length: 3000 }, generateOtpCode);
    expect(codes.every((c) => c.length === 6)).toBe(true);
  });

  // A guard against the classic modulo-bias shortcut. With bias, low values are
  // over-represented; over 20k draws the halves should be close to even.
  it("is not obviously biased toward the low half of the range", () => {
    const draws = 20_000;
    const low = Array.from({ length: draws }, generateOtpCode).filter(
      (c) => Number(c) < 500_000,
    ).length;
    const ratio = low / draws;

    expect(ratio).toBeGreaterThan(0.47);
    expect(ratio).toBeLessThan(0.53);
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

describe("hashOtpCode", () => {
  it("is salted by challenge id, so the same code hashes differently per challenge", () => {
    expect(hashOtpCode("123456", "challenge-a")).not.toEqual(
      hashOtpCode("123456", "challenge-b"),
    );
  });

  it("is deterministic for the same code and challenge", () => {
    expect(hashOtpCode("123456", "c1")).toEqual(hashOtpCode("123456", "c1"));
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

describe("verifyOtpCode", () => {
  it("accepts the code for its own challenge", () => {
    const code = generateOtpCode();
    expect(verifyOtpCode(code, "challenge-1", hashOtpCode(code, "challenge-1"))).toBe(true);
  });

  it("rejects a wrong code", () => {
    const stored = hashOtpCode("111111", "challenge-1");
    expect(verifyOtpCode("222222", "challenge-1", stored)).toBe(false);
  });

  // The salt's real purpose: a correct code for a DIFFERENT challenge must not verify.
  // Without binding, a code captured from one challenge would be replayable against
  // any other live challenge.
  it("rejects a correct code presented against a different challenge", () => {
    const code = "123456";
    const storedForA = hashOtpCode(code, "challenge-a");
    expect(verifyOtpCode(code, "challenge-b", storedForA)).toBe(false);
  });
});

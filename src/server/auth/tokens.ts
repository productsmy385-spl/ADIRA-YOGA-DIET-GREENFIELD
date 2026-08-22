import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * Token generation, hashing, and comparison.
 *
 * Every function here is small, and every one of them is a place where a plausible
 * shortcut is a vulnerability. They are gathered into one module so the reasoning lives
 * in one place and so the tests can be exhaustive.
 *
 * The rule the whole module serves: **a secret is presented once and stored only as a
 * hash.** A database disclosure should cost the operator their data without additionally
 * handing over a working set of credentials.
 */

/** 32 bytes = 256 bits of entropy. Session tokens are not guessable at this size. */
const SESSION_TOKEN_BYTES = 32;

/**
 * Six digits. Short enough to type from memory, and safe only because the attempt budget
 * is small and rate-limited — 10^6 is trivially brute-forceable without those limits,
 * which is why `otp.ts` treats the attempt counter as load-bearing rather than advisory.
 */
const OTP_DIGITS = 6;

/**
 * Generate an opaque session token.
 *
 * base64url rather than hex: same entropy, shorter cookie, and no characters that need
 * escaping in a Set-Cookie header.
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a token for storage.
 *
 * SHA-256 with no salt and no key stretching, deliberately. Stretching (bcrypt, argon2)
 * exists to make *low-entropy* secrets expensive to guess. A 256-bit random token has no
 * guessable structure, so stretching would add latency to every authenticated request
 * while defending against nothing. Passwords would need argon2; these are not passwords.
 *
 * Returns a Buffer because the column is `bytea` — storing hex in a text column would
 * double the storage and invite a case-sensitivity bug on comparison.
 */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * Hash a SESSION token, keyed by the identity domain's secret.
 *
 * HMAC rather than the bare `hashToken` above, and this is the one place in the codebase
 * where `SESSION_SECRET` and `OWNER_SESSION_SECRET` do actual work.
 *
 * ADR-001 claims the two identity domains cannot be replayed against each other. Until
 * this function existed that claim rested entirely on the two session tables being
 * separate — true, but it meant a bug that looked up a tenant token against
 * `owner_sessions` would have *matched*, because both stored the same unkeyed SHA-256.
 * Keying the hash makes the separation cryptographic: a token minted for the tenant
 * domain hashes to a value that cannot appear in `owner_sessions` at all, whatever the
 * calling code believes it is doing.
 *
 * The stretching argument above still applies — a 256-bit random token needs no argon2.
 * HMAC costs the same as SHA-256 and buys domain separation.
 *
 * Consequence worth knowing: rotating a session secret invalidates every live session in
 * that domain. That is the correct behaviour for a secret rotation, and it is why the two
 * secrets must be rotated independently.
 */
export function hashSessionToken(token: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(token, "utf8").digest();
}

/** Compare a presented session token against its stored keyed hash, in constant time. */
export function verifySessionToken(
  presented: string,
  storedHash: Buffer,
  secret: string,
): boolean {
  return safeEqual(hashSessionToken(presented, secret), storedHash);
}

/**
 * Generate a numeric OTP.
 *
 * `randomInt` is cryptographically secure and, importantly, free of modulo bias —
 * `randomBytes(4).readUInt32BE() % 1000000` is the usual shortcut and skews the
 * distribution toward lower values.
 *
 * Zero-padded, so every code is exactly six characters. An unpadded code would leak a
 * little information through its length and would break a fixed-width input.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

/**
 * Hash an OTP code for storage.
 *
 * Salted with the challenge id. Without a salt, the entire keyspace is a million
 * SHA-256 values — a rainbow table that fits in memory — so an attacker reading
 * `otp_challenges` could invert every live code instantly. Binding the hash to the
 * challenge id also stops a hash captured from one challenge being replayed against
 * another.
 */
export function hashOtpCode(code: string, challengeId: string): Buffer {
  return createHash("sha256").update(`${challengeId}:${code}`, "utf8").digest();
}

/**
 * Constant-time comparison.
 *
 * `a === b` on secrets leaks their contents through timing: it returns at the first
 * differing byte, so an attacker can recover a secret one character at a time by
 * measuring response latency. `timingSafeEqual` always reads both buffers fully.
 *
 * It throws on length mismatch — which would itself be a timing signal — so the lengths
 * are compared first and a mismatch returns false immediately. That is safe here because
 * the *length* of a hash is fixed and public; only its contents are secret.
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Compare a presented token against a stored hash, in constant time.
 */
export function verifyToken(presented: string, storedHash: Buffer): boolean {
  return safeEqual(hashToken(presented), storedHash);
}

/**
 * Compare a presented OTP code against a stored hash, in constant time.
 */
export function verifyOtpCode(
  presented: string,
  challengeId: string,
  storedHash: Buffer,
): boolean {
  return safeEqual(hashOtpCode(presented, challengeId), storedHash);
}

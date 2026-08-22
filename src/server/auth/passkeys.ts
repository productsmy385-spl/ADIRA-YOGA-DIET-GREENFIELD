import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { branding } from "@/lib/branding";
import { env } from "@/lib/env";
import {
  countUserPasskeys,
  findCredentialById,
  listOwnerPasskeys,
  listUserPasskeys,
  recordPasskeyUse,
  registerPasskey,
  revokeOwnerPasskey,
  revokeUserPasskey,
  type PasskeyCredential,
} from "@/server/repositories/passkey-credentials";
import {
  consumeChallenge,
  createChallenge,
  findLiveChallenge,
} from "@/server/repositories/webauthn-challenges";

import { CHALLENGE_TTL_MS, webauthnConfigFrom } from "./webauthn-config";

/**
 * The two WebAuthn ceremonies.
 *
 * Passkeys are the primary authentication mechanism; OTP is the fallback. What makes an
 * assertion meaningful is that the signature covers a challenge *this server issued and
 * has not seen used*. Both halves of that are enforced here:
 *
 *   - the challenge is stored server-side, in `webauthn_challenges`, never in a cookie
 *   - it is consumed by a conditional UPDATE, so two concurrent verifications of the
 *     same challenge cannot both win
 *
 * No private key and no biometric ever reaches this server. What is stored is a public
 * key, which is why a disclosure of `passkey_credentials` costs an attacker nothing.
 */

const config = () => webauthnConfigFrom(env.APP_URL, branding.name);

/** Who a ceremony belongs to. Registration always knows; authentication may not. */
export type PasskeyPrincipal =
  | { domain: "TENANT"; userId: string; organizationId: string; email: string; fullName: string }
  | { domain: "PLATFORM"; ownerAccountId: string; email: string; fullName: string };

export interface BeginResult {
  challengeId: string;
  /** Passed straight to the browser's WebAuthn API. */
  options: unknown;
}

function expiry(): Date {
  return new Date(Date.now() + CHALLENGE_TTL_MS);
}

/**
 * A stable, non-reversible per-principal handle for the authenticator to key on.
 *
 * WebAuthn's `userID` is stored *on the authenticator* and can be shown in a device's
 * passkey manager. Using the raw database id would publish an internal identifier to a
 * device we do not control; using the email would publish the address. A UUID's bytes
 * are meaningless outside our database, which is what we want here.
 */
function userHandle(principal: PasskeyPrincipal): Uint8Array<ArrayBuffer> {
  const id =
    principal.domain === "TENANT" ? principal.userId : principal.ownerAccountId;
  // `Uint8Array.from` rather than the encoder's own result: TextEncoder returns
  // Uint8Array<ArrayBufferLike>, which could in principle be backed by a SharedArrayBuffer
  // and so does not satisfy the library's Uint8Array<ArrayBuffer>.
  return Uint8Array.from(new TextEncoder().encode(id));
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function beginPasskeyRegistration(
  principal: PasskeyPrincipal,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<BeginResult> {
  const { rpId, rpName, expectedOrigin } = config();
  void expectedOrigin;

  // Existing credentials are excluded so the authenticator can refuse to enrol the same
  // device twice — otherwise a user ends up with duplicate passkeys for one phone and no
  // way to tell them apart when revoking.
  const existing =
    principal.domain === "TENANT"
      ? await listUserPasskeys(principal.organizationId, principal.userId)
      : await listOwnerPasskeys(principal.ownerAccountId);

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: userHandle(principal),
    userName: principal.email,
    userDisplayName: principal.fullName,
    // "none" — see webauthn-config.ts. Attestation would hand us a hardware identifier
    // for every customer's device, which we have no use for and would then have to hold.
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId.toString("base64url"),
      transports: c.transports as never,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challenge = await createChallenge({
    ceremony: "REGISTRATION",
    challenge: Buffer.from(options.challenge, "base64url"),
    expiresAt: expiry(),
    userId: principal.domain === "TENANT" ? principal.userId : null,
    organizationId: principal.domain === "TENANT" ? principal.organizationId : null,
    ownerAccountId: principal.domain === "PLATFORM" ? principal.ownerAccountId : null,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { challengeId: challenge.id, options };
}

export type CompleteRegistrationResult =
  | { ok: true; credentialId: string }
  | { ok: false; reason: "CHALLENGE_NOT_FOUND" | "CHALLENGE_MISMATCH" | "NOT_VERIFIED" };

export async function completePasskeyRegistration(input: {
  challengeId: string;
  response: RegistrationResponseJSON;
  principal: PasskeyPrincipal;
  label?: string | null;
}): Promise<CompleteRegistrationResult> {
  const { rpId, expectedOrigin } = config();

  const stored = await findLiveChallenge(input.challengeId);
  if (!stored || stored.ceremony !== "REGISTRATION") {
    return { ok: false, reason: "CHALLENGE_NOT_FOUND" };
  }

  // The challenge must belong to the principal completing it. Without this check, a
  // signed-in user could complete somebody else's open registration and attach their own
  // authenticator to that account.
  const belongs =
    input.principal.domain === "TENANT"
      ? stored.userId === input.principal.userId &&
        stored.organizationId === input.principal.organizationId
      : stored.ownerAccountId === input.principal.ownerAccountId;

  if (!belongs) return { ok: false, reason: "CHALLENGE_MISMATCH" };

  // Consume BEFORE verifying. A challenge is spent by being attempted, not by
  // succeeding — otherwise a failed attempt leaves it live for a retry, which is exactly
  // the window a replay wants.
  if (!(await consumeChallenge(stored.id))) {
    return { ok: false, reason: "CHALLENGE_NOT_FOUND" };
  }

  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: stored.challenge.toString("base64url"),
    expectedOrigin,
    expectedRPID: rpId,
    requireUserVerification: false,
  });

  if (!verification.verified) return { ok: false, reason: "NOT_VERIFIED" };

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const saved = await registerPasskey({
    userId: input.principal.domain === "TENANT" ? input.principal.userId : null,
    organizationId:
      input.principal.domain === "TENANT" ? input.principal.organizationId : null,
    ownerAccountId:
      input.principal.domain === "PLATFORM" ? input.principal.ownerAccountId : null,
    credentialId: Buffer.from(credential.id, "base64url"),
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: (credential.transports ?? []) as string[],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    label: input.label ?? null,
  });

  return { ok: true, credentialId: saved.id };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Begin sign-in.
 *
 * No principal and no `allowCredentials`: this is the discoverable-credential flow, so
 * the browser offers whichever passkey it holds for this site and the server learns who
 * it is only from the assertion. That also means this endpoint reveals nothing — an
 * attacker cannot use it to discover whether an address has an account, because it never
 * receives an address.
 */
export async function beginPasskeyAuthentication(
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<BeginResult> {
  const { rpId } = config();

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
  });

  const challenge = await createChallenge({
    ceremony: "AUTHENTICATION",
    challenge: Buffer.from(options.challenge, "base64url"),
    expiresAt: expiry(),
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { challengeId: challenge.id, options };
}

export type AuthenticatedPrincipal =
  | { domain: "TENANT"; userId: string; organizationId: string }
  | { domain: "PLATFORM"; ownerAccountId: string };

export type CompleteAuthenticationResult =
  | { ok: true; principal: AuthenticatedPrincipal; credential: PasskeyCredential }
  | {
      ok: false;
      reason:
        | "CHALLENGE_NOT_FOUND"
        | "CREDENTIAL_NOT_FOUND"
        | "NOT_VERIFIED"
        | "COUNTER_REGRESSED";
    };

export async function completePasskeyAuthentication(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<CompleteAuthenticationResult> {
  const { rpId, expectedOrigin } = config();

  const stored = await findLiveChallenge(input.challengeId);
  if (!stored || stored.ceremony !== "AUTHENTICATION") {
    return { ok: false, reason: "CHALLENGE_NOT_FOUND" };
  }

  if (!(await consumeChallenge(stored.id))) {
    return { ok: false, reason: "CHALLENGE_NOT_FOUND" };
  }

  const credentialId = Buffer.from(input.response.id, "base64url");
  const credential = await findCredentialById(credentialId);

  // Finding a row proves this credential was registered by SOMEONE. It proves nothing
  // about the caller until the signature verifies against the stored public key below.
  if (!credential) return { ok: false, reason: "CREDENTIAL_NOT_FOUND" };

  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: stored.challenge.toString("base64url"),
    expectedOrigin,
    expectedRPID: rpId,
    credential: {
      id: credential.credentialId.toString("base64url"),
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as never,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) return { ok: false, reason: "NOT_VERIFIED" };

  const { newCounter } = verification.authenticationInfo;

  /**
   * Cloned-credential detection.
   *
   * An authenticator that reports a counter must advance it on every use. A value that
   * failed to move suggests the credential has been copied — the assertion is valid, so
   * the signature check cannot catch this, and it is the only signal available.
   *
   * Many authenticators legitimately report a constant zero, which is why zero is
   * exempt. Treating that as an attack would lock out a large share of real devices.
   */
  if (credential.counter > 0 && newCounter <= credential.counter) {
    return { ok: false, reason: "COUNTER_REGRESSED" };
  }

  await recordPasskeyUse(credential.id, newCounter);

  const principal: AuthenticatedPrincipal =
    credential.userId && credential.organizationId
      ? {
          domain: "TENANT",
          userId: credential.userId,
          organizationId: credential.organizationId,
        }
      : { domain: "PLATFORM", ownerAccountId: credential.ownerAccountId! };

  return { ok: true, principal, credential };
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

export type RevokeResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "WOULD_REMOVE_LAST" };

/**
 * Revoke a passkey, refusing to remove the last one.
 *
 * Removing someone's only credential converts "sign in with your phone" into an account
 * recovery ticket — and `docs/AUTHENTICATION.md` still records recovery-without-email as
 * unsolved. The caller must enrol a replacement first.
 */
export async function revokePasskeyForUser(
  organizationId: string,
  userId: string,
  credentialDbId: string,
): Promise<RevokeResult> {
  if ((await countUserPasskeys(organizationId, userId)) <= 1) {
    return { ok: false, reason: "WOULD_REMOVE_LAST" };
  }
  const removed = await revokeUserPasskey(organizationId, userId, credentialDbId);
  return removed ? { ok: true } : { ok: false, reason: "NOT_FOUND" };
}

export async function revokePasskeyForOwner(
  ownerAccountId: string,
  credentialDbId: string,
): Promise<RevokeResult> {
  const remaining = await listOwnerPasskeys(ownerAccountId);
  if (remaining.length <= 1) return { ok: false, reason: "WOULD_REMOVE_LAST" };

  const removed = await revokeOwnerPasskey(ownerAccountId, credentialDbId);
  return removed ? { ok: true } : { ok: false, reason: "NOT_FOUND" };
}

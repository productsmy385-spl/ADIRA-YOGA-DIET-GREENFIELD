import { NextResponse } from "next/server";
import { z } from "zod";

import { completePasskeyAuthentication } from "@/server/auth/passkeys";
import { evaluateRateLimit, windowStart } from "@/server/auth/rate-limit";
import { issuePlatformSession, issueTenantSession } from "@/server/auth/session";
import { requestContext } from "@/server/http/request-context";
import { recordAudit } from "@/server/repositories/audit-logs";
import {
  clearAccountAttempts,
  countRecentAttempts,
  recordAttempt,
} from "@/server/repositories/auth-attempts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  challengeId: z.uuid(),
  response: z.looseObject({ id: z.string().min(1) }),
});

/**
 * Complete a passkey sign-in and issue a session.
 *
 * ORDER MATTERS HERE. The rate limit is evaluated *before* the assertion is verified,
 * because verification is the expensive part and an unlimited endpoint that does
 * cryptography on demand is a denial-of-service surface as well as a guessing one.
 *
 * The rate-limit subject is the credential id, not an account — at this point nobody has
 * proved who they are, and attributing attempts to the account named by an unverified
 * assertion would let an attacker lock out any account by spraying its credential id.
 */
export async function POST(request: Request) {
  const context = await requestContext();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const credentialSubject = `credential:${parsed.data.response.id}`;

  const counts = await countRecentAttempts({
    action: "passkey.authenticate",
    accountSubject: credentialSubject,
    ip: context.ip,
    since: windowStart("passkey.authenticate", new Date()),
  });

  const limit = evaluateRateLimit("passkey.authenticate", counts);
  if (!limit.allowed) {
    await recordAudit({
      actorDomain: "TENANT",
      action: "passkey.authenticate",
      outcome: "DENIED",
      metadata: { reason: "RATE_LIMITED", limitedBy: limit.limitedBy },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await completePasskeyAuthentication({
    challengeId: parsed.data.challengeId,
    response: parsed.data.response as never,
  });

  if (!result.ok) {
    await recordAttempt({
      action: "passkey.authenticate",
      accountSubject: credentialSubject,
      ip: context.ip,
      successful: false,
    });

    await recordAudit({
      actorDomain: "TENANT",
      action: "passkey.authenticate",
      outcome: "FAILURE",
      // COUNTER_REGRESSED is the one worth watching: it suggests a cloned credential
      // rather than a mistyped anything.
      metadata: { reason: result.reason },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    // Uniform message. "No such credential" and "signature did not verify" are different
    // facts, and telling them apart is free reconnaissance.
    return NextResponse.json({ error: "Could not sign you in." }, { status: 401 });
  }

  await recordAttempt({
    action: "passkey.authenticate",
    accountSubject: credentialSubject,
    ip: context.ip,
    successful: true,
  });

  // Clear the failure history so a user who fumbled twice before succeeding does not
  // carry those failures into their next sign-in.
  await clearAccountAttempts(credentialSubject, "passkey.authenticate");

  // The session is minted only now — after the signature verified against the stored
  // public key. Everything above this line is untrusted input.
  if (result.principal.domain === "TENANT") {
    await issueTenantSession(
      result.principal.userId,
      result.principal.organizationId,
      context,
    );
  } else {
    await issuePlatformSession(result.principal.ownerAccountId, context);
  }

  await recordAudit({
    organizationId:
      result.principal.domain === "TENANT" ? result.principal.organizationId : null,
    actorDomain: result.principal.domain,
    actorId:
      result.principal.domain === "TENANT"
        ? result.principal.userId
        : result.principal.ownerAccountId,
    action: "passkey.authenticate",
    resourceType: "passkey_credential",
    resourceId: result.credential.id,
    outcome: "SUCCESS",
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return NextResponse.json({ ok: true, domain: result.principal.domain });
}

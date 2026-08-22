import { NextResponse } from "next/server";
import { z } from "zod";

import {
  completePasskeyRegistration,
  type PasskeyPrincipal,
} from "@/server/auth/passkeys";
import { readPlatformSession, readTenantSession } from "@/server/auth/session";
import { requestContext } from "@/server/http/request-context";
import { recordAudit } from "@/server/repositories/audit-logs";
import { findOwnerAccountById } from "@/server/repositories/owner-accounts";

export const dynamic = "force-dynamic";

/**
 * The attestation response is validated only for *shape* here. Its contents are
 * cryptographically verified by `completePasskeyRegistration`; this schema exists so a
 * malformed body produces a 400 rather than a stack trace from deep inside the WebAuthn
 * library.
 */
const bodySchema = z.object({
  challengeId: z.uuid(),
  // Passed through to the library, which does the real validation.
  response: z.looseObject({ id: z.string().min(1) }),
  label: z.string().trim().min(1).max(60).optional(),
});

export async function POST(request: Request) {
  const context = await requestContext();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const tenant = await readTenantSession();
  const platform = tenant ? null : await readPlatformSession();

  let principal: PasskeyPrincipal;

  if (tenant) {
    principal = {
      domain: "TENANT",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      email: tenant.email,
      fullName: tenant.fullName,
    };
  } else if (platform) {
    const account = await findOwnerAccountById(platform.ownerAccountId);
    if (!account) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    principal = {
      domain: "PLATFORM",
      ownerAccountId: account.id,
      email: account.email,
      fullName: account.fullName,
    };
  } else {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const result = await completePasskeyRegistration({
    challengeId: parsed.data.challengeId,
    // The library owns this type; the schema above only guaranteed it is an object with
    // an id, which is all this layer is entitled to assert about it.
    response: parsed.data.response as never,
    principal,
    label: parsed.data.label ?? null,
  });

  await recordAudit({
    organizationId: principal.domain === "TENANT" ? principal.organizationId : null,
    actorDomain: principal.domain,
    actorId:
      principal.domain === "TENANT" ? principal.userId : principal.ownerAccountId,
    actorLabel: principal.email,
    action: "passkey.register",
    resourceType: "passkey_credential",
    resourceId: result.ok ? result.credentialId : null,
    outcome: result.ok ? "SUCCESS" : "FAILURE",
    // The reason is recorded, never the attestation. CHALLENGE_MISMATCH in particular
    // means someone tried to complete a ceremony that was not theirs.
    metadata: result.ok ? {} : { reason: result.reason },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  if (!result.ok) {
    // One message for every failure. Distinguishing "no such challenge" from "that
    // challenge is not yours" tells a prober which of the two they hit.
    return NextResponse.json({ error: "Could not register this device." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, credentialId: result.credentialId });
}

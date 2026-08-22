import { NextResponse } from "next/server";

import { beginPasskeyRegistration, type PasskeyPrincipal } from "@/server/auth/passkeys";
import { readPlatformSession, readTenantSession } from "@/server/auth/session";
import { findOwnerAccountById } from "@/server/repositories/owner-accounts";
import { requestContext } from "@/server/http/request-context";

/**
 * Start enrolling a passkey.
 *
 * **Requires an existing session.** Passkey enrolment is an action taken by someone
 * already authenticated — by OTP on first sign-in, or by an existing passkey when adding
 * a second device. An unauthenticated enrolment endpoint would let anyone attach an
 * authenticator to any account, which is account takeover with extra steps.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const context = await requestContext();

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
    // The platform session carries only the account id, so the display fields come from
    // the account row. They are shown in the device's passkey manager, not used for auth.
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

  const { challengeId, options } = await beginPasskeyRegistration(principal, context);

  return NextResponse.json({ challengeId, options });
}

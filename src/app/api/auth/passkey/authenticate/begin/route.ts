import { NextResponse } from "next/server";

import { beginPasskeyAuthentication } from "@/server/auth/passkeys";
import { requestContext } from "@/server/http/request-context";

/**
 * Start a passkey sign-in.
 *
 * Unauthenticated by necessity, and it takes **no input at all** — no email, no user
 * hint. That is what makes it safe to leave open: with nothing to look up, it cannot be
 * used to discover whether an address has an account. The browser offers whichever
 * discoverable credential it holds for this origin, and the server learns who is signing
 * in only from the assertion.
 *
 * Not rate-limited by account, because there is no account to attribute an attempt to.
 * The IP budget applies at the *complete* step, where a real credential is presented.
 * Issuing a challenge costs one row and no email, so the abuse ceiling here is low —
 * `purgeStaleChallenges` sweeps the rows.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const context = await requestContext();
  const { challengeId, options } = await beginPasskeyAuthentication(context);

  return NextResponse.json({ challengeId, options });
}

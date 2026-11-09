import { redirect } from "next/navigation";

import { currentClerkIdentity } from "@/server/auth/clerk";
import { requestMeta } from "@/server/auth/request-meta";
import { signInWithClerk } from "@/server/auth/sign-in";
import { homePathForRole, normaliseRole } from "@/server/authorization/roles";

/**
 * Where Clerk sends a person after they sign in or accept an invitation.
 *
 * A route handler rather than a page because it SETS the session cookie, which a server
 * component render cannot do. GET is acceptable here despite the side effect: it acts only
 * on the caller's own verified Clerk session, and a cross-site request cannot carry one
 * that the victim does not already hold — the worst a forged link achieves is signing the
 * victim into their own account.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await currentClerkIdentity();
  if (!identity) redirect("/sign-in");

  const result = await signInWithClerk(identity, await requestMeta());

  switch (result.kind) {
    case "SIGNED_IN":
      // The role comes from the database row just signed into, never from the request.
      redirect(homePathForRole(normaliseRole(result.role)));
    case "CHOOSE_ORGANIZATION":
      redirect("/sign-in/choose");
    case "NO_ACCOUNT":
      redirect("/sign-in/no-access");
  }
}

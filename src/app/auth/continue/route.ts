import type { NextRequest } from "next/server";
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
 *
 * `?org=<slug>` arrives from a studio's public site (FR-WEB-015). It is a preference for
 * which of the person's OWN memberships to open, never a grant.
 */
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("org") ?? "";
  const org = SLUG.test(raw) ? raw : undefined;
  const orgQuery = org ? `?org=${org}` : "";

  const identity = await currentClerkIdentity();
  if (!identity) redirect(`/sign-in${orgQuery}`);

  const result = await signInWithClerk(identity, await requestMeta(), org);

  switch (result.kind) {
    case "SIGNED_IN":
      // The role comes from the database row just signed into, never from the request.
      redirect(homePathForRole(normaliseRole(result.role)));
    case "CHOOSE_ORGANIZATION":
      redirect("/sign-in/choose");
    case "NO_ACCOUNT":
      redirect(`/sign-in/no-access${orgQuery}`);
  }
}

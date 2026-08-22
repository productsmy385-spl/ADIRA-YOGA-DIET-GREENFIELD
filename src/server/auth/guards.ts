import { redirect } from "next/navigation";

import { readPlatformSession, readTenantSession } from "./session";
import type { PlatformSessionContext, TenantSessionContext } from "./session";

import type { TenantRoleValue } from "@/server/db/types";
import { recordAudit } from "@/server/repositories/audit-logs";

/**
 * Page and action guards.
 *
 * Separated from `session.ts` because these functions *navigate* — they throw Next's
 * redirect — and a module that resolves a session should be callable from somewhere that
 * wants to handle the absence itself. `readTenantSession()` answers "who is this";
 * `requireTenantSession()` answers "who is this, and stop if nobody".
 *
 * WHY NOT MIDDLEWARE
 *
 * Next middleware runs on every matching request and is the conventional place for this.
 * It is the wrong place here: middleware cannot reach the database in the edge runtime,
 * so it could only check that a cookie is *present*, not that the session behind it is
 * live, unrevoked, and attached to an ACTIVE user in an ACTIVE organization. A guard that
 * checks presence is a guard that passes for a revoked session, which is precisely the
 * case that matters. These run in the server components and actions that hold the data,
 * where the real check is possible.
 */

export const SIGN_IN_PATH = "/sign-in";
export const OWNER_SIGN_IN_PATH = "/owner/sign-in";

/**
 * Require a tenant session, or redirect to sign-in.
 *
 * The return type is non-nullable, so callers get a checked guarantee rather than a
 * `!` assertion — `redirect()` throws, and TypeScript understands it never returns.
 */
export async function requireTenantSession(): Promise<TenantSessionContext> {
  const session = await readTenantSession();
  if (!session) redirect(SIGN_IN_PATH);
  return session;
}

export async function requirePlatformSession(): Promise<PlatformSessionContext> {
  const session = await readPlatformSession();
  if (!session) redirect(OWNER_SIGN_IN_PATH);
  return session;
}

/**
 * Require a tenant session held by one of `roles`.
 *
 * A denial is audited before redirecting. That is the point of the function existing at
 * all rather than callers writing `if (session.role !== ...)`: an authorization failure
 * is a security event, and `audit_logs_denied_idx` exists so these can be watched. A
 * scattered inline check records nothing.
 *
 * Note this is ROLE, not reach. ADMIN is assignment-scoped (ADR-002), so passing this
 * guard says the caller is an admin — never that they may act on a particular customer.
 * That question is `canActOn`'s, at the point the customer is known.
 */
export async function requireRole(
  ...roles: readonly TenantRoleValue[]
): Promise<TenantSessionContext> {
  const session = await requireTenantSession();

  if (!roles.includes(session.role)) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "authz.denied",
      outcome: "DENIED",
      metadata: { held: session.role, required: [...roles] },
    });

    // Deliberately back to the dashboard, not to a 403 page. The caller is a legitimate
    // signed-in user who reached somewhere they may not go; an error page that spells out
    // which role would have been sufficient is a small map of the privilege model.
    redirect("/dashboard");
  }

  return session;
}

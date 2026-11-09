import { redirect } from "next/navigation";

import { currentClerkIdentity } from "@/server/auth/clerk";
import { requestMeta } from "@/server/auth/request-meta";
import { ownerSignInWithClerk } from "@/server/auth/sign-in";

/**
 * Platform-domain counterpart of /auth/continue (ADR-001: separate table, cookie, secret).
 *
 * A refusal goes to `?denied=1` on the sign-in page, which shows one message for every
 * reason — the audit log carries which one.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await currentClerkIdentity();
  if (!identity) redirect("/super-admin/sign-in");

  const result = await ownerSignInWithClerk(identity, await requestMeta());
  redirect(result.ok ? "/super-admin" : "/super-admin/sign-in?denied=1");
}

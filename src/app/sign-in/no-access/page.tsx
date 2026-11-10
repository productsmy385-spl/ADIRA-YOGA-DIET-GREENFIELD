import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { currentClerkIdentity } from "@/server/auth/clerk";
import { findLiveSiteBySlug } from "@/server/repositories/websites";

import { switchAccountAction } from "../actions";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

/**
 * A Clerk-verified person with no enterable Adira account.
 *
 * One message for "never invited", "suspended" and "identity conflict" alike — the reason
 * is in the audit log, where an administrator can act on it. The way forward is the
 * existing access-request flow, which an organization's administrator reviews.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const identity = await currentClerkIdentity();
  if (!identity) redirect("/sign-in");

  // The studio the visitor came from — named only if it has a live public site.
  const raw = (await searchParams).org ?? "";
  const studio = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(raw) ? await findLiveSiteBySlug(raw) : null;
  const where = studio ? studio.content.branding.businessName : "any organisation here";

  return (
    <AuthShell
      title="No access yet"
      description={
        identity.verifiedEmail
          ? `${identity.verifiedEmail} isn't an active member of ${where}.`
          : "Your email address hasn't been verified."
      }
    >
      <div className="space-y-3">
        <Button asChild className="w-full">
          <Link href="/request-access">Request access</Link>
        </Button>
        <form action={switchAccountAction}>
          <Button type="submit" variant="outline" className="w-full">
            Use a different email
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs/relaxed text-muted-foreground">
        If you were invited, use the address the invitation was sent to. If your access was
        suspended, contact your organisation.
      </p>
    </AuthShell>
  );
}

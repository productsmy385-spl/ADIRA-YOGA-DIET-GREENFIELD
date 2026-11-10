import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";
import { findLiveSiteBySlug } from "@/server/repositories/websites";
import { homePathForRole } from "@/server/authorization/roles";

export const metadata: Metadata = { title: "Sign in" };

/** Reads cookies to decide whether to redirect, so it is never cached or prerendered. */
export const dynamic = "force-dynamic";

/**
 * Sign-in is Clerk's widget (ADR-015). Clerk proves the address — by emailed code, or a
 * passkey if enabled in the Clerk dashboard — then sends the browser to /auth/continue,
 * which decides whether that address may enter Adira at all.
 */
const SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  // Already in Adira: go home. `readTenantSession`, not a cookie check, so a revoked or
  // expired session lands here rather than bouncing off a dashboard.
  const session = await readTenantSession();
  if (session) redirect(homePathForRole(session.role));

  /*
   * Arrived from a studio's public site (FR-WEB-015). Branding is shown ONLY when that
   * studio has a live site — the same facts its public page already shows — so this page
   * cannot be used to probe which slugs exist. The slug travels on as a hint and decides
   * nothing until the server checks membership after Clerk.
   */
  const raw = (await searchParams).org ?? "";
  const studio = SLUG.test(raw) ? await findLiveSiteBySlug(raw) : null;
  const continueUrl = studio ? `/auth/continue?org=${studio.slug}` : "/auth/continue";

  // Proved to Clerk but not yet in Adira (e.g. the session expired): skip the widget.
  const { userId } = await auth();
  if (userId) redirect(continueUrl);

  const logo = studio?.content.branding.logo;

  return (
    <AuthShell
      title={`Sign in to ${studio?.content.branding.businessName ?? branding.name}`}
      description="Use the email address your organisation invited."
      logo={logo?.url ? { url: logo.url, alt: logo.alt || studio!.content.branding.businessName } : null}
      footer={
        <>
          <div className="mt-8 border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">Don&rsquo;t have access?</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/request-access">Request access</Link>
            </Button>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {branding.name} is private software. Your organisation reviews every request.
          </p>
        </>
      }
    >
      <SignIn
        routing="hash"
        forceRedirectUrl={continueUrl}
        signUpUrl="/sign-up"
        withSignUp={false}
      />
    </AuthShell>
  );
}

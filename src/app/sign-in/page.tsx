import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";
import { homePathForRole } from "@/server/authorization/roles";

export const metadata: Metadata = { title: "Sign in" };

/** Reads cookies to decide whether to redirect, so it is never cached or prerendered. */
export const dynamic = "force-dynamic";

/**
 * Sign-in is Clerk's widget (ADR-015). Clerk proves the address — by emailed code, or a
 * passkey if enabled in the Clerk dashboard — then sends the browser to /auth/continue,
 * which decides whether that address may enter Adira at all.
 */
export default async function SignInPage() {
  // Already in Adira: go home. `readTenantSession`, not a cookie check, so a revoked or
  // expired session lands here rather than bouncing off a dashboard.
  const session = await readTenantSession();
  if (session) redirect(homePathForRole(session.role));

  // Proved to Clerk but not yet in Adira (e.g. the session expired): skip the widget.
  const { userId } = await auth();
  if (userId) redirect("/auth/continue");

  return (
    <AuthShell
      title={`Sign in to ${branding.name}`}
      description="Use the email address your organisation invited."
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
        forceRedirectUrl="/auth/continue"
        signUpUrl="/sign-up"
        withSignUp={false}
      />
    </AuthShell>
  );
}

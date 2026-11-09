import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readPlatformSession } from "@/server/auth/session";

import { switchAccountAction } from "../../sign-in/actions";

export const metadata: Metadata = { title: "Platform sign in" };
export const dynamic = "force-dynamic";

/**
 * The platform operator's sign-in (ADR-001, ADR-015).
 *
 * Same Clerk identity provider as /sign-in, different destination: /super-admin/auth/continue
 * checks `owner_accounts` and issues the PLATFORM cookie with its own secret. A Clerk user
 * who is a tenant member gains nothing here — no path reads `users` for platform access.
 */
export default async function SuperAdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  if (await readPlatformSession()) redirect("/super-admin");

  const denied = (await searchParams).denied === "1";
  const { userId } = await auth();

  // Proved to Clerk already: try the platform check, unless it has just refused — that
  // would loop between this page and the continue route.
  if (userId && !denied) redirect("/super-admin/auth/continue");

  return (
    <AuthShell
      title={`${branding.name} platform`}
      description="Sign in to administer organisations."
      footer={
        <p className="mt-8 text-center text-xs/relaxed text-muted-foreground">
          Platform accounts are separate from organisation accounts and are created by a
          database operator, never through this application.
        </p>
      }
    >
      {denied && userId ? (
        <div className="space-y-4">
          {/* One message for every refusal; the reason is in the audit log. */}
          <Alert variant="destructive">
            <AlertDescription>This account cannot use the platform console.</AlertDescription>
          </Alert>
          <form action={switchAccountAction}>
            <input type="hidden" name="returnTo" value="platform" />
            <Button type="submit" variant="outline" className="w-full">
              Use a different account
            </Button>
          </form>
        </div>
      ) : (
        <SignIn routing="hash" forceRedirectUrl="/super-admin/auth/continue" withSignUp={false} />
      )}
    </AuthShell>
  );
}

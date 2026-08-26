import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";

import { PasskeySignInButton } from "@/components/passkey-sign-in";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Never cached, never prerendered.
 *
 * The page reads a session cookie to decide whether to redirect, so a cached copy would
 * either be wrong or would leak one visitor's redirect decision to the next.
 */
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Already signed in — skip the form. `readTenantSession` rather than a cookie check:
  // a revoked or expired session must land on the form, not bounce to a dashboard that
  // will only bounce back.
  if (await readTenantSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark, nothing to optimise */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-10 mix-blend-multiply" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Sign in to {branding.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&rsquo;ll email you a one-time code.
          </p>
        </div>

        {/* Passkeys are the primary mechanism; the emailed code is the fallback. The
            button removes itself entirely where WebAuthn is unavailable, and it owns its
            own divider so that "or use a code" cannot be left stranded above nothing. */}
        <PasskeySignInButton withDivider className="mb-6" />

        <SignInForm />

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">Don&rsquo;t have access?</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/request-access">Request access</Link>
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Adira is private software. Your organisation reviews every request.
        </p>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { branding } from "@/lib/branding";
import { readPlatformSession } from "@/server/auth/session";

import { OwnerSignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Platform sign in" };
export const dynamic = "force-dynamic";

/**
 * The platform operator's sign-in.
 *
 * This route was referenced by `guards.ts` from the moment platform sessions existed and
 * was never built, which meant the seeded platform account had no way in at all — the one
 * account that administers every tenant could not sign in.
 *
 * A separate page from `/sign-in` is correct HERE and only here: this is a different
 * identity domain with its own table, cookie, and signing secret (ADR-001). A separate
 * page for ADMIN would be the parallel authentication system the brief forbids, because
 * admins and members are the same rows behind the same cookie.
 */
export default async function SuperAdminSignInPage() {
  if (await readPlatformSession()) redirect("/super-admin");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-10 mix-blend-multiply" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            {branding.name} platform
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to administer organisations.
          </p>
        </div>

        <OwnerSignInForm />

        <p className="mt-8 text-center text-xs/relaxed text-muted-foreground">
          Platform accounts are separate from organisation accounts and are created by a
          database operator, never through this application.
        </p>
      </main>
    </div>
  );
}

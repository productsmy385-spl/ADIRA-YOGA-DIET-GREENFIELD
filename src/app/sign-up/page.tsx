import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { branding } from "@/lib/branding";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

/**
 * Where a Clerk invitation email lands (the FlowDine OS flow).
 *
 * The link carries a `__clerk_ticket` that only <SignUp> can consume. With the Clerk
 * instance in Restricted sign-up mode, this page creates an account ONLY for an invited
 * address; anyone else is refused by Clerk before Adira is involved. Even if sign-up were
 * opened, /auth/continue would still give an uninvited account NO_ACCOUNT.
 *
 * `?for=platform` (set only by scripts/seed-owner.mjs) sends a platform owner on to the
 * PLATFORM check instead. It selects between two fixed paths, never a posted URL, and
 * grants nothing by itself: the continue route still requires an `owner_accounts` row.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const platform = (await searchParams).for === "platform";

  return (
    <AuthShell
      title={platform ? `${branding.name} platform` : `Join ${branding.name}`}
      description={
        platform
          ? "Confirm your email to activate your platform account."
          : "Your organisation has invited you. Confirm your email to activate your account."
      }
    >
      <SignUp
        routing="hash"
        forceRedirectUrl={platform ? "/super-admin/auth/continue" : "/auth/continue"}
        signInUrl={platform ? "/super-admin/sign-in" : "/sign-in"}
      />
    </AuthShell>
  );
}

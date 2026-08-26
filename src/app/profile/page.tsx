import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";

import { GlassPanel } from "@/components/glass/glass";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { PasskeyEnrolButton } from "@/components/passkey-sign-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireTenantSession } from "@/server/auth/guards";
import { listUserPasskeys } from "@/server/repositories/passkey-credentials";

import { signOutAction } from "../sign-in/actions";
import { revokePasskeyAction, signOutEverywhereAction } from "./actions";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/**
 * The account page, for anybody signed in.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS ROUTE HAD TO EXIST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `PasskeyEnrolButton` was written, tested and imported by nothing. The sign-in page
 * offers `PasskeySignInButton`, so the product could authenticate somebody with a passkey
 * they had no way to create — enrolment existed end to end, in the API routes and the
 * repository, and had no surface. This page is where that belongs.
 *
 * It also gathers the account controls that were scattered or missing: sign-out lived on
 * one page, and "sign out everywhere" existed in the repository (`revokeAllTenantSessions`)
 * with no caller at all.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ONE PAGE, EVERY ROLE, NO ROLE BRANCHING ON DATA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `requireTenantSession` rather than `requireRole`: an admin has an account too, and their
 * passkeys and sessions are administered exactly like anybody else's. Nothing shown here
 * is member health data — it is identity, credentials and preferences, all of which belong
 * to the person reading the page.
 *
 * The platform domain has no profile here and must not: a `SUPER_ADMIN` is a different
 * identity domain with its own table, cookie and secret (ADR-001), and this page reads
 * the tenant session.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * READ-ONLY FIELDS ARE MARKED AS SUCH RATHER THAN FAKED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Name, email and organisation render as text, not inputs. There is no `updateUser` in
 * the repository layer, and an email field in particular is an account-recovery surface —
 * changing the address changes where one-time codes are sent, and doing that without
 * verifying the new address first is a takeover primitive. An input that silently did
 * nothing, or that wrote the column with no verification, would both be worse than saying
 * plainly who to ask.
 */

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  USER: "Member",
  ORG_OWNER: "Administrator",
  CUSTOMER: "Member",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      {description && (
        <p className="mt-1 max-w-prose text-sm/relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <GlassPanel className="mt-3 p-5">{children}</GlassPanel>
    </section>
  );
}

export default async function ProfilePage() {
  const session = await requireTenantSession();

  // Scoped by organisation AND user, both from the session. There is no id in this route.
  const passkeys = await listUserPasskeys(session.organizationId, session.userId);

  const isStaff = session.role === "ADMIN";

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/profile" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {session.fullName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ROLE_LABEL[session.role] ?? session.role}</Badge>
          <span className="text-sm text-muted-foreground">{session.organizationName}</span>
        </div>

        <Section
          title="Account"
          description={
            isStaff
              ? "Your details are held by your organisation. A platform administrator changes them."
              : "Your details are held by your organisation. Ask your consultant or an administrator to change them."
          }
        >
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" value={session.fullName} />
            <Field label="Email" value={session.email} />
            <Field label="Organisation" value={session.organizationName} />
            <Field label="Role" value={ROLE_LABEL[session.role] ?? session.role} />
          </dl>
        </Section>

        <Section
          title="Appearance"
          description="Applies to this browser only, and is remembered on this device."
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="type-meta mt-0.5 text-muted-foreground">
                Light, dark, or follow your system setting.
              </p>
            </div>
            <ThemeToggle />
          </div>

          {/*
            Motion is NOT a setting here, and that is deliberate rather than an omission.
            It is read from the operating system via `prefers-reduced-motion`, which is
            where somebody with vestibular symptoms has already set it once for every
            application. An in-app toggle that could disagree with the OS is a second
            source of truth for an accessibility preference.
          */}
          <p className="type-meta mt-4 border-t border-border pt-4 text-muted-foreground">
            Adira follows your device&rsquo;s reduced-motion setting automatically. Turn it
            on in your operating system&rsquo;s accessibility settings and animations stop
            here too.
          </p>
        </Section>

        <Section
          title="Passkeys"
          description="Sign in with your device instead of waiting for a code by email."
        >
          {passkeys.length === 0 ? (
            <p className="text-sm/relaxed text-muted-foreground">
              No passkeys yet. Adding one lets you sign in with your fingerprint, face or
              device PIN.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {passkeys.map((passkey) => (
                <li
                  key={passkey.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="flex items-start gap-3">
                    <KeyRound
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm text-foreground">
                        {passkey.label ?? passkey.deviceType ?? "Passkey"}
                      </p>
                      <p className="type-meta mt-0.5 text-muted-foreground">
                        Added {passkey.createdAt.toISOString().slice(0, 10)}
                        {passkey.lastUsedAt
                          ? ` · last used ${passkey.lastUsedAt.toISOString().slice(0, 10)}`
                          : " · not used yet"}
                      </p>
                    </div>
                  </div>

                  <form action={revokePasskeyAction}>
                    <input type="hidden" name="credentialId" value={passkey.id} />
                    <Button type="submit" size="xs" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {/*
            Renders nothing where WebAuthn is unavailable — an older browser or an
            embedded webview, both of which real customers use. A button that cannot work
            produces an error the person cannot act on, and email codes remain available
            to them regardless.
          */}
          <div className="mt-4 border-t border-border pt-4">
            <PasskeyEnrolButton />
          </div>
        </Section>

        <Section
          title="Security"
          description="Signing out everywhere ends every session on every device, including this one."
        >
          <div className="flex flex-wrap gap-3">
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut aria-hidden />
                Sign out
              </Button>
            </form>

            <form action={signOutEverywhereAction}>
              <Button type="submit" variant="outline" size="sm">
                <ShieldCheck aria-hidden />
                Sign out everywhere
              </Button>
            </form>
          </div>

          <p className="type-meta mt-4 text-muted-foreground">
            Use &ldquo;everywhere&rdquo; if you have signed in on a device you no longer
            have. Your passkeys are not removed — remove those above.
          </p>
        </Section>

        <Section title="Your data">
          <p className="text-sm/relaxed text-muted-foreground">
            Your practice, check-ins and reports are visible to you and to the
            administrators you are assigned to — not to everybody at{" "}
            {session.organizationName}, and not to Adira&rsquo;s platform operators.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/progress">View your progress</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/reports">View your reports</Link>
            </Button>
          </div>
        </Section>
      </main>

      <MobileTabBar role={session.role} currentPath="/profile" />
    </div>
  );
}

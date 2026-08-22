import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";

/**
 * The public entry page.
 *
 * This replaced a Phase 0 status report that listed what the foundation had established
 * and stated, in the copy, that there was "no application to sign in to yet". That was
 * true when it was written and became false the moment authentication landed — at which
 * point the page was actively telling visitors the opposite of what the product does.
 *
 * The lesson worth keeping: copy that describes build progress dates badly, because
 * nothing fails when it goes stale. What is here now describes what Adira is *for*, which
 * does not expire, plus one honest status paragraph that says plainly which parts are not
 * built. When programmes and reporting land, that paragraph is the only thing to revisit.
 *
 * It stays honest about the gap rather than advertising features that do not exist —
 * `src/app/dashboard/page.tsx` carries the same rule for data.
 */

const AUDIENCES = ["customers", "consultants", "organisations"] as const;

export default async function Home() {
  const t = await getTranslations("landing");

  // A returning, signed-in visitor should not be asked to sign in again. Reading the real
  // session rather than merely checking for a cookie matters: a revoked or expired session
  // must show the sign-in call to action, not a dashboard link that bounces straight back.
  const session = await readTenantSession();

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark, no optimisation to gain */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-9" />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {branding.name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm" variant={session ? "default" : "outline"}>
            <Link href={session ? "/dashboard" : "/sign-in"}>
              {session ? t("goToDashboard") : t("signIn")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <section className="pt-12 sm:pt-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {branding.tagline}
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            {t("heroLead")}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <Link href={session ? "/dashboard" : "/sign-in"}>
                {session ? t("goToDashboard") : t("signIn")}
              </Link>
            </Button>

            <p className="text-sm text-muted-foreground">
              {session ? t("signedInAs", { name: session.fullName }) : t("ctaHint")}
            </p>
          </div>
        </section>

        <section aria-labelledby="audience-heading" className="mt-20">
          <h2
            id="audience-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {t("audienceHeading")}
          </h2>

          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {AUDIENCES.map((key) => (
              <li
                key={key}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <h3 className="font-medium text-card-foreground">
                  {t(`audience.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm/relaxed text-muted-foreground">
                  {t(`audience.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="status-heading"
          className="mt-16 rounded-lg border border-border bg-secondary/40 p-6"
        >
          <h2
            id="status-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {t("statusHeading")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm/relaxed text-muted-foreground">
            {t("statusBody")}
          </p>
        </section>
      </main>
    </div>
  );
}

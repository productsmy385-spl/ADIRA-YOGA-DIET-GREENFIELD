import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  ClipboardList,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";

/**
 * The public entry page.
 *
 * This replaced a Phase 0 status report whose copy stated there was "no application to
 * sign in to yet" — true when written, false the moment authentication landed, and
 * nothing failed to signal it. The rule that came out of that: describe what Adira is
 * FOR, which does not expire, and keep build progress to one paragraph that is obvious
 * to revisit.
 *
 * Every claim in the "how it works" section maps to something actually built. The
 * snapshot-on-assignment line is ADR-009; the "no adherence rather than zero" line is a
 * real behaviour of the activity engine, tested in tests/activity-lifecycle.test.ts.
 * Nothing here advertises a feature that does not exist.
 */

const HOW = [
  { key: "assigned", Icon: ClipboardList },
  { key: "practise", Icon: CalendarCheck },
  { key: "progress", Icon: TrendingUp },
] as const;

const AUDIENCES = [
  { key: "customers", Icon: User },
  { key: "consultants", Icon: Users },
  { key: "organisations", Icon: Building2 },
] as const;

export default async function Home() {
  const t = await getTranslations("landing");

  // A returning, signed-in visitor should not be asked to sign in again. Reading the real
  // session rather than merely checking for a cookie matters: a revoked or expired session
  // must show the sign-in call to action, not a dashboard link that bounces straight back.
  const session = await readTenantSession();

  const destination = session ? "/dashboard" : "/sign-in";
  const cta = session ? t("goToDashboard") : t("signIn");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark, no optimisation to gain */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {branding.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm" variant={session ? "default" : "outline"}>
              <Link href={destination}>{cta}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero. `items-center` plus a min-height means the fold is filled on a laptop
            without the content drifting to the top of a tall desktop monitor. */}
        <section className="border-b border-border/70">
          <div className="mx-auto flex min-h-[min(34rem,72dvh)] max-w-6xl flex-col justify-center px-6 py-20">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              {t("eyebrow")}
            </p>

            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              {branding.tagline}
            </h1>

            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              {t("heroLead")}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild size="lg">
                <Link href={destination}>
                  {cta}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>

              <p className="text-sm text-muted-foreground">
                {session ? t("signedInAs", { name: session.fullName }) : t("ctaHint")}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-b border-border/70">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h2
              id="how-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              {t("howHeading")}
            </h2>

            <ol className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10">
              {HOW.map(({ key, Icon }, index) => (
                <li key={key}>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 flex items-baseline gap-2 font-medium text-foreground">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {t(`how.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    {t(`how.${key}.body`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="audience-heading" className="border-b border-border/70">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <h2
              id="audience-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              {t("audienceHeading")}
            </h2>

            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {AUDIENCES.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-4 font-medium text-card-foreground">
                    {t(`audience.${key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    {t(`audience.${key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="status-heading">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="rounded-xl border border-border bg-secondary/40 p-6 sm:p-8">
              <h2
                id="status-heading"
                className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
              >
                {t("statusHeading")}
              </h2>
              <p className="mt-3 max-w-3xl text-sm/relaxed text-muted-foreground">
                {t("statusBody")}
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-6" />
            <span className="text-sm font-medium text-foreground">{branding.name}</span>
          </div>

          <div className="max-w-xl sm:text-right">
            <p className="text-sm text-muted-foreground">{t("footerNote")}</p>
            <p className="mt-2 text-xs/relaxed text-muted-foreground">{t("footerBuilt")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

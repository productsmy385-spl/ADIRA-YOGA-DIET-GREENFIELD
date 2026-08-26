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

import { GlassCard } from "@/components/glass/glass";
import { Stagger } from "@/components/motion/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import { BotanicalBackdrop } from "./(landing)/botanical-backdrop";
import { BreathingFigure } from "./(landing)/breathing-figure";
import { branding } from "@/lib/branding";
import { readTenantSession } from "@/server/auth/session";

/**
 * The public entry page.
 *
 * This replaced a Phase 0 status report whose copy stated there was "no application to
 * sign in to yet" — true when written, false the moment authentication landed, and
 * nothing failed to signal it. The rule that came out of that: describe what Adira is
 * FOR, which does not expire.
 *
 * THAT RULE WAS BROKEN AGAIN, IN THE SAME PLACE, AND HAS NOW BEEN FIXED PROPERLY.
 *
 * The fix at the time kept "build progress to one paragraph that is obvious to revisit" —
 * and nobody revisited it. The paragraph went on telling visitors that "programmes,
 * activity tracking, and reporting are still to come" long after all three shipped, which
 * is a worse lie than the original because it understates a working product.
 *
 * So there is no longer a build-status paragraph at all. That section now describes how
 * health data is handled, which is true today, was true last month, and cannot go stale
 * by the product improving. Do not reintroduce a roadmap here in any form.
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
    /*
     * `bg-canvas` is the UX spec §5 background system — base gradient, botanical fields
     * and noise, all CSS. `BotanicalBackdrop` layers slow movement on top of it, and is
     * imported ONLY here. See that component for why motion is permitted on this page and
     * forbidden inside the authenticated application.
     */
    <div className="relative flex min-h-dvh flex-col bg-canvas">
      <BotanicalBackdrop />

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
          <div className="mx-auto grid min-h-[min(34rem,72dvh)] max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            {/* The hero copy is NOT wrapped in Reveal. It is above the fold and it is the
                first thing anybody reads — animating it in delays the only content that
                has to be instant, and on a slow connection produces a visible blank. */}
            <div>
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                {t("eyebrow")}
              </p>

              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
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

            {/* Hidden below `lg` rather than shrunk. On a phone the copy and the call to
                action should own the fold; a decorative figure competing for that space
                pushes the button below it. */}
            <div className="hidden justify-center lg:flex">
              <BreathingFigure className="max-w-sm" />
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

            {/* Staggered, because these three ARE a sequence — assigned, practised,
                measured. The motion carries that order rather than decorating it. */}
            <Stagger className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-10" step={70}>
              {HOW.map(({ key, Icon }, index) => (
                <div key={key}>
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
                </div>
              ))}
            </Stagger>
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

            <Stagger className="mt-8 grid gap-4 sm:grid-cols-3" step={70}>
              {AUDIENCES.map(({ key, Icon }) => (
                /* GlassCard, not a plain bordered box — this is the one section where a
                   glass surface earns its cost, floating over the drifting shapes. Its
                   inner surface is opaque, so the text contrast is testable regardless of
                   what is behind it (glass.tsx, rule 1). */
                <GlassCard key={key} interactive className="h-full">
                  <div className="flex h-full flex-col p-6">
                    <Icon className="size-5 text-primary" aria-hidden />
                    <h3 className="mt-4 font-medium text-card-foreground">
                      {t(`audience.${key}.title`)}
                    </h3>
                    <p className="mt-2 text-sm/relaxed text-muted-foreground">
                      {t(`audience.${key}.body`)}
                    </p>
                  </div>
                </GlassCard>
              ))}
            </Stagger>
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

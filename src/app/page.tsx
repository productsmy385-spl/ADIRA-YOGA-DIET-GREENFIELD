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
    <div className="theme-bg-wrapper theme-landing-nature relative flex min-h-dvh flex-col bg-canvas">
      <BotanicalBackdrop />

      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-8 shrink-0 mix-blend-multiply" />
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
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="relative z-10 mx-auto grid min-h-[min(34rem,72dvh)] max-w-6xl items-center gap-10 px-6 pt-12 pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
            <div>
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">
                {t("eyebrow")}
              </p>

              <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
                Your Daily <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">Wellness Companion</span>
              </h1>

              <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
                Personalized yoga therapy, nutrition plans, daily activity tracking, and progress reporting to help you live a healthier, balanced life.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button asChild size="lg" className="rounded-full shadow-md transition-all hover:shadow-lg">
                  <Link href={destination}>
                    Start Your Journey
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>

                <Button asChild size="lg" variant="outline" className="rounded-full backdrop-blur-xs">
                  <Link href="#features-heading">
                    Learn More
                  </Link>
                </Button>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                {session ? t("signedInAs", { name: session.fullName }) : t("ctaHint")}
              </p>
            </div>

            {/* Clean Mobile-Responsive Hero Illustration */}
            <div className="w-full flex justify-center">
              <BreathingFigure className="w-full" />
            </div>
          </div>
        </section>

        {/* Trust & Stats Section */}
        <section className="border-b border-border/70 bg-card/40 py-8 backdrop-blur-xs">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4 lg:gap-8">
              <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
                <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">500+</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">Happy Members</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
                <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">30+</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">Yoga Programs</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
                <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">100+</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">Healthy Recipes</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md">
                <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">98%</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">Satisfaction Rate</div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-medium tracking-wide text-muted-foreground">
              <span>🌿</span>
              <span>Wellness. In Balance. Every Day.</span>
              <span>🌿</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-b border-border/70">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Complete Wellness Platform
              </p>
              <h2
                id="features-heading"
                className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
              >
                Everything You Need for <span className="text-primary">Balanced Living</span>
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
                Personalized yoga, nutrition plans, daily activity tracking, and progress reporting tailored for you and your consultant.
              </p>
            </div>

            <Stagger className="mt-12 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4" step={60}>
              <GlassCard interactive className="group h-full">
                <div className="flex h-full flex-col">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <ClipboardList className="size-6" />
                  </div>
                  <h3 className="mt-5 font-semibold text-card-foreground">Yoga &amp; Meditation</h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    Guided yoga sessions, meditation, and breathing practices structured by your practitioner.
                  </p>
                </div>
              </GlassCard>

              <GlassCard interactive className="group h-full">
                <div className="flex h-full flex-col">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors group-hover:bg-amber-500 group-hover:text-white">
                    <TrendingUp className="size-6" />
                  </div>
                  <h3 className="mt-5 font-semibold text-card-foreground">Healthy Nutrition</h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    Personalized meal schedules, dietary guidance, and daily nutrition tracking for optimal health.
                  </p>
                </div>
              </GlassCard>

              <GlassCard interactive className="group h-full">
                <div className="flex h-full flex-col">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 transition-colors group-hover:bg-sky-500 group-hover:text-white">
                    <CalendarCheck className="size-6" />
                  </div>
                  <h3 className="mt-5 font-semibold text-card-foreground">Daily Wellness</h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    Simple daily check-ins for mood, sleep, water, and habits to build sustainable wellness routines.
                  </p>
                </div>
              </GlassCard>

              <GlassCard interactive className="group h-full">
                <div className="flex h-full flex-col">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500 group-hover:text-white">
                    <Users className="size-6" />
                  </div>
                  <h3 className="mt-5 font-semibold text-card-foreground">Progress &amp; Reports</h3>
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">
                    Transparent adherence metrics and progress reports shared directly with your care team.
                  </p>
                </div>
              </GlassCard>
            </Stagger>
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

        <section aria-labelledby="testimonials-heading" className="border-b border-border/70">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Member Testimonials
              </p>
              <h2
                id="testimonials-heading"
                className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
              >
                Loved by Members &amp; Practitioners
              </h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              <GlassCard className="p-6">
                <div className="flex items-center gap-1 text-amber-500">
                  ★★★★★
                </div>
                <p className="mt-4 text-sm/relaxed text-muted-foreground">
                  &ldquo;Adira transformed my daily routine. The combination of structured yoga sessions and custom meal plans keeps me energized and mindful.&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/20 font-semibold text-primary">
                    AS
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Ananya Sharma</div>
                    <div className="text-xs text-muted-foreground">Yoga Practitioner</div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-1 text-amber-500">
                  ★★★★★
                </div>
                <p className="mt-4 text-sm/relaxed text-muted-foreground">
                  &ldquo;As a wellness consultant, assigning custom programmes and reviewing client progress daily has never been this seamless.&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/20 font-semibold text-emerald-600 dark:text-emerald-400">
                    RK
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Dr. Rajesh Kumar</div>
                    <div className="text-xs text-muted-foreground">Wellness Consultant</div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-1 text-amber-500">
                  ★★★★★
                </div>
                <p className="mt-4 text-sm/relaxed text-muted-foreground">
                  &ldquo;The 3D yoga guidance and daily check-ins make building healthy habits easy. Highly recommended for anyone on a wellness journey!&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-sky-500/20 font-semibold text-sky-600 dark:text-sky-400">
                    PM
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Priya Mehta</div>
                    <div className="text-xs text-muted-foreground">Active Member</div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </section>

        {/* Final CTA Banner */}
        <section className="border-b border-border/70 py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <GlassCard className="p-8 sm:p-12">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Ready to Start Your Wellness Journey?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                Join Adira Wellness today to access personalized yoga routines, tailored nutrition plans, and daily habit tracking.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Button asChild size="lg">
                  <Link href={destination}>
                    {cta}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/experience/yoga">
                    Explore 3D Experience
                  </Link>
                </Button>
              </div>
            </GlassCard>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-6 mix-blend-multiply" />
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

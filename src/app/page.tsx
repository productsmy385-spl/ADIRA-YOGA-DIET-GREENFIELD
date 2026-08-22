import { getTranslations } from "next-intl/server";

import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";

/**
 * Foundation page.
 *
 * Deliberately not a dashboard. Phase 0 built architecture, not features, and a screen
 * full of plausible-looking numbers would misrepresent what actually exists — every
 * figure on it would have to be invented, which is the exact failure mode the project
 * brief calls out. This page shows what the foundation contains and what is still empty.
 *
 * It earns its keep twice over: it exercises the design tokens in both themes, and it is
 * the only page currently proving the i18n wiring resolves and renders.
 */

const FOUNDATION_ITEMS = ["domains", "tenancy", "rank", "migrations", "env", "tokens"] as const;
const UPCOMING_PHASES = ["1", "2", "3", "4"] as const;

export default async function Home() {
  const t = await getTranslations("foundation");

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark, no optimisation to gain */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-9 text-primary" />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {branding.name}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          <span className="size-1.5 rounded-full bg-status-complete" />
          {t("badge")}
        </div>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          {branding.tagline}
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
          {branding.description} {t("intro")}
        </p>

        <section aria-labelledby="foundation-heading" className="mt-14">
          <h2
            id="foundation-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {t("establishedHeading")}
          </h2>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {FOUNDATION_ITEMS.map((key) => (
              <li
                key={key}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <h3 className="font-medium text-card-foreground">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm/relaxed text-muted-foreground">
                  {t(`items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="next-heading" className="mt-14">
          <h2
            id="next-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {t("nextHeading")}
          </h2>

          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {UPCOMING_PHASES.map((phase) => (
              <li
                key={phase}
                className="flex items-center gap-3 px-5 py-3.5 text-sm text-card-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-status-pending" />
                {t(`phases.${phase}`)}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
          {t.rich("docsNote", {
            code: (chunks) => (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                {chunks}
              </code>
            ),
          })}
        </footer>
      </main>
    </div>
  );
}

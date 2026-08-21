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
 * It does earn its keep: it exercises the design tokens in both themes, so a broken
 * palette shows up immediately rather than at the end of Phase 5.
 */

const foundation = [
  {
    title: "Two identity domains",
    body: "Platform owners and tenant users live in separate tables, with separate sessions and separate signing secrets. No code path upgrades one into the other.",
  },
  {
    title: "Tenancy as a constraint",
    body: "Composite foreign keys mean PostgreSQL itself refuses to link a consultant in one organization to a customer in another. Cross-tenant leakage is unrepresentable, not merely untested.",
  },
  {
    title: "Rank rules, not just permissions",
    body: "An actor must strictly outrank a target to act on them, so peers cannot disable each other. Covered by 49 passing tests.",
  },
  {
    title: "Migrations that run on deploy",
    body: "Forward-only, checksum-verified, advisory-locked, and wired as Railway's pre-deploy step — so a deploy cannot succeed against an unmigrated database.",
  },
  {
    title: "Configuration validated at boot",
    body: "Every environment variable is parsed at startup. A missing key fails the deploy by name, rather than throwing on whichever request first needs it.",
  },
  {
    title: "One place for colour",
    body: "Every value on this page resolves to a token in globals.css. A hardcoded hex anywhere in src/ is a lint error.",
  },
];

const upcoming = [
  "Phase 1 — Railway PostgreSQL, schema applied",
  "Phase 2 — Passkeys and OTP",
  "Phase 3 — RBAC and cross-tenant test suites",
  "Phase 4 — Service and repository layers",
];

export default function Home() {
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
          Phase 0 complete — foundation and security model
        </div>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
          {branding.tagline}
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
          {branding.description} There is no application to sign in to yet — this page
          reports what the foundation establishes, and what each remaining phase adds.
        </p>

        <section aria-labelledby="foundation-heading" className="mt-14">
          <h2
            id="foundation-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            What Phase 0 established
          </h2>

          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {foundation.map((item) => (
              <li
                key={item.title}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <h3 className="font-medium text-card-foreground">{item.title}</h3>
                <p className="mt-2 text-sm/relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="next-heading" className="mt-14">
          <h2
            id="next-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Next
          </h2>

          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {upcoming.map((phase) => (
              <li
                key={phase}
                className="flex items-center gap-3 px-5 py-3.5 text-sm text-card-foreground"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-status-pending" />
                {phase}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
          Architecture, security model, and schema design are documented in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            docs/
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            decisions/
          </code>
          .
        </footer>
      </main>
    </div>
  );
}

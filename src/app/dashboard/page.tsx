import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";
import { requireTenantSession } from "@/server/auth/guards";
import { listAuditForOrganization } from "@/server/repositories/audit-logs";
import { countUsersByRole } from "@/server/repositories/users";

import { signOutAction } from "../sign-in/actions";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * The first authenticated surface.
 *
 * Every value on this page is read from PostgreSQL at request time. That constraint is
 * deliberate and worth stating, because the alternative is what the foundation page
 * (`src/app/page.tsx`) was written to avoid: a screen of plausible-looking numbers that
 * are actually invented. There are no programmes, activities, or progress figures here —
 * not because they would be hard to lay out, but because nothing in the database can
 * produce them yet, and a dashboard that implies otherwise is worse than a sparse one.
 *
 * What it does show is real: who you are, which tenant you are scoped to, your role, and
 * — for staff — genuine counts and the genuine audit trail.
 *
 * This is NOT the customer dashboard. BMAD/STATUS.md records that repo Phase 5 needs
 * Analysis → Product → UX first, because there is no PRD or acceptance criteria behind
 * it. This page is the authenticated shell that proves the session and repository layers
 * work end to end against real data.
 */

const ROLE_LABEL: Record<string, string> = {
  ORG_OWNER: "Organisation owner",
  ADMIN: "Admin / consultant",
  CUSTOMER: "Customer",
};

export default async function DashboardPage() {
  const session = await requireTenantSession();

  // Staff see organisation-wide figures; a customer must not. This is the tenancy rule
  // in miniature — the query simply is not run for a CUSTOMER, rather than being run and
  // then hidden in the markup, which would still have read the rows.
  const isStaff = session.role === "ORG_OWNER" || session.role === "ADMIN";

  const [counts, audit] = await Promise.all([
    isStaff ? countUsersByRole(session.organizationId) : Promise.resolve(null),
    session.role === "ORG_OWNER"
      ? listAuditForOrganization(session.organizationId, 8)
      : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {session.organizationName}
              </p>
              <p className="text-xs text-muted-foreground">{branding.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {session.fullName}
          </h1>
          <Badge variant="secondary">{ROLE_LABEL[session.role] ?? session.role}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{session.email}</p>

        <section aria-labelledby="account-heading" className="mt-10">
          <h2
            id="account-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Your account
          </h2>

          <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            <Field label="Organisation" value={session.organizationName} />
            <Field label="Organisation ref" value={session.organizationSlug} mono />
            <Field label="Role" value={ROLE_LABEL[session.role] ?? session.role} />
            <Field
              label="Session expires"
              value={session.expiresAt.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          </dl>
        </section>

        {counts ? (
          <section aria-labelledby="people-heading" className="mt-10">
            <h2
              id="people-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              People in {session.organizationName}
            </h2>

            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Stat label="Customers" value={counts.CUSTOMER} />
              <Stat label="Admins / consultants" value={counts.ADMIN} />
              <Stat label="Owners" value={counts.ORG_OWNER} />
            </dl>
          </section>
        ) : null}

        {audit.length > 0 ? (
          <section aria-labelledby="audit-heading" className="mt-10">
            <h2
              id="audit-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Recent activity
            </h2>

            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-card-foreground">
                    {entry.action}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.actorLabel ?? "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          Programmes, activity tracking, and reporting are not built yet. Everything shown
          above is read from the database at request time — nothing on this page is
          placeholder data.
        </p>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 text-sm text-card-foreground ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums text-card-foreground">
        {value}
      </dd>
    </div>
  );
}

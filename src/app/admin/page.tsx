import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { branding } from "@/lib/branding";
import { requireRole } from "@/server/auth/guards";
import { listCaseload, type CaseloadEntry } from "@/server/repositories/caseload";
import type { AttentionSignal } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Caseload" };
export const dynamic = "force-dynamic";

/**
 * The consultant's morning triage (USER-JOURNEYS J3).
 *
 * THIS PAGE OPENS ON EXCEPTIONS, NOT TOTALS.
 *
 * "You have 32 customers" is not actionable. "4 customers missed three or more sessions
 * this week" is. J3 identifies this as the difference between a consultant carrying a
 * larger caseload and a consultant drowning, so the customers needing attention come
 * first and carry the reason — never an unranked table sorted by name.
 *
 * Reach is decided in the query (ADR-002): an `ADMIN` sees only their assigned
 * customers, an `ORG_OWNER` sees the organisation. Unassigned customers are not fetched
 * and filtered — they are never selected.
 */

const SIGNAL_TEXT: Record<AttentionSignal, string> = {
  CONSULTANT_FLAGGED: "Flagged for review",
  NEVER_STARTED: "Has not started",
  SUSTAINED_ABSENCE: "No activity for several days",
  ADHERENCE_COLLAPSE: "Adherence has dropped sharply",
  REPEATED_MISSES: "Several missed sessions",
  WELLBEING_DECLINE: "Reporting low mood or sleep",
};

/** Rate as a percentage, or an em dash. Never 0% for "no data" (docs/METRICS.md). */
function rate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function CustomerRow({ entry }: { entry: CaseloadEntry }) {
  const primary = entry.attention.primary;

  return (
    <li>
      <Link
        href={`/admin/customers/${entry.customerId}`}
        className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/60"
      >
        <div className="min-w-0">
          <p className="font-medium text-card-foreground">{entry.fullName}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {primary
              ? SIGNAL_TEXT[primary]
              : (entry.planName ?? "No programme assigned")}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-medium text-card-foreground">
            {rate(entry.currentRate)}
          </p>
          <p className="text-xs text-muted-foreground">7 days</p>
        </div>
      </Link>
    </li>
  );
}

export default async function AdminPage() {
  // ORG_OWNER included: an owner-operator of a small studio is often the consultant too.
  const session = await requireRole("ADMIN", "ORG_OWNER");

  const caseload = await listCaseload(
    session.organizationId,
    session.role,
    session.userId,
  );

  const needsAttention = caseload.filter((c) => c.attention.flagged);
  const rest = caseload.filter((c) => !c.attention.flagged);

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-8" />
          <span className="font-semibold tracking-tight text-foreground">
            {branding.name}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Your caseload
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.role === "ORG_OWNER"
            ? `Every customer in ${session.organizationName}.`
            : "The customers assigned to you."}
        </p>

        <section aria-labelledby="attention-heading" className="mt-8">
          <h2
            id="attention-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Needs your attention
          </h2>

          {needsAttention.length > 0 ? (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {needsAttention.map((entry) => (
                <CustomerRow key={entry.customerId} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {caseload.length === 0
                ? "You have no customers assigned yet."
                : "Nobody needs attention today."}
            </p>
          )}
        </section>

        {rest.length > 0 && (
          <section aria-labelledby="everyone-heading" className="mt-10">
            <h2
              id="everyone-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Everyone else · {rest.length}
            </h2>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {rest.map((entry) => (
                <CustomerRow key={entry.customerId} entry={entry} />
              ))}
            </ul>
          </section>
        )}

        {/*
          The honesty note this product keeps making: adherence measures what customers
          REPORTED, and completion is self-declared. Saying so on the page it is read on
          matters more than saying it in a document nobody opens.
        */}
        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          Adherence is self-reported and covers the last 7 days. A dash means nothing was
          scheduled — not that nothing was done.
        </p>
      </main>
    </div>
  );
}

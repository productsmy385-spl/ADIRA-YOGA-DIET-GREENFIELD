import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CaseloadEntry } from "@/server/repositories/caseload";
import type { AttentionSignal } from "@/server/services/metrics";

/**
 * One consultant's caseload, rendered.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ONE COMPONENT, THREE DASHBOARDS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `/admin`, `/trainer` and `/staff` all answer the same question — "who am I responsible
 * for, and who needs me today" — and differ only in what else is on the page around it.
 * Three copies of this list would drift: a fix to the attention wording, or to the
 * "a dash is not zero" rule, would land in one and not the others, and nothing would fail.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IT RENDERS ROWS. IT DOES NOT DECIDE WHO IS IN THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `listCaseload` already scoped this list in SQL, by `consultant_assignments` and
 * `organization_id`, before it reached any component. Nothing here filters, and nothing
 * here should ever start to — a presentation component that hides rows is a permission
 * check somebody can bypass by reading the page source.
 *
 * The same is true of the link on each row: `/admin/customers/[id]` re-asks
 * `resolveMemberAccess` on arrival. Rendering the link grants nothing.
 */

const SIGNAL_TEXT: Record<AttentionSignal, string> = {
  CONSULTANT_FLAGGED: "Flagged for review",
  NEVER_STARTED: "Has not started",
  SUSTAINED_ABSENCE: "No activity for several days",
  ADHERENCE_COLLAPSE: "Adherence has dropped sharply",
  REPEATED_MISSES: "Several missed sessions",
  WELLBEING_DECLINE: "Reporting low mood or sleep",
};

/**
 * A rate as a percentage, or an em dash.
 *
 * NEVER 0% for "nothing was scheduled" (docs/METRICS.md). A member with no plan has not
 * failed to adhere to it, and showing zero tells their consultant they did.
 */
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
            {primary ? SIGNAL_TEXT[primary] : (entry.planName ?? "No programme assigned")}
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

export interface CaseloadListProps {
  entries: CaseloadEntry[];
  /** Shown when the caseload is empty. Differs by role, so the caller supplies it. */
  emptyMessage: string;
  /** Optional action on the empty state, so it leads somewhere rather than stopping. */
  emptyAction?: { href: string; label: string };
}

export function CaseloadList({ entries, emptyMessage, emptyAction }: CaseloadListProps) {
  const needsAttention = entries.filter((entry) => entry.attention.flagged);
  const rest = entries.filter((entry) => !entry.attention.flagged);

  return (
    <>
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
          <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {entries.length === 0 ? emptyMessage : "Nobody needs attention today."}
            </p>
            {entries.length === 0 && emptyAction && (
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href={emptyAction.href}>{emptyAction.label}</Link>
              </Button>
            )}
          </div>
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
        The honesty note this product keeps making, and it belongs with the numbers rather
        than in a document nobody opens: adherence measures what members REPORTED, and
        completion is self-declared.
      */}
      <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        Adherence is self-reported and covers the last 7 days. A dash means nothing was
        scheduled — not that nothing was done.
      </p>
    </>
  );
}

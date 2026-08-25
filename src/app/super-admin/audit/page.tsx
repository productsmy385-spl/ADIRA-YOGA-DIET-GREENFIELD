import type { Metadata } from "next";
import Link from "next/link";

import { PlatformNav } from "@/components/nav/platform-nav";
import { requirePlatformSession } from "@/server/auth/guards";
import { listPlatformAudit } from "@/server/repositories/platform-audit";
import type { AuditOutcome } from "@/server/repositories/audit-logs";

export const metadata: Metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

/**
 * The platform-wide audit trail.
 *
 * WHY DENIALS GET THEIR OWN FILTER
 *
 * `audit_logs_denied_idx` is a partial index over exactly these rows, and it exists
 * because a denial is the signal worth watching: an admin reaching for a member outside
 * their caseload, or a session reaching across tenants, is either a bug or a probe. An
 * index nobody queries is worth nothing, so the filter is one click rather than something
 * an operator must know to construct.
 *
 * WHAT AN AUDIT ROW IS NOT
 *
 * It is not a window into member data. Rows carry an actor, an action, a resource TYPE and
 * ID, and an outcome — `assertNoSecrets` refuses to record secrets in metadata, and no
 * activity, check-in or report content is ever written here. A resource id is an opaque
 * identifier; reading the record it names still goes through `canAccessMemberData`, which
 * denies a platform actor unconditionally (ADR-001).
 *
 * The filter arrives as a query parameter, which is safe here for the reason it usually is
 * not: it selects among fixed values this file defines, and anything unrecognised falls
 * back to "all". It never reaches SQL as text — see `listPlatformAudit`.
 */

const OUTCOMES = ["DENIED", "FAILURE", "SUCCESS"] as const;

function parseOutcome(value: string | undefined): AuditOutcome | undefined {
  return (OUTCOMES as readonly string[]).includes(value ?? "")
    ? (value as AuditOutcome)
    : undefined;
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>;
}) {
  await requirePlatformSession();

  const { outcome: raw } = await searchParams;
  const outcome = parseOutcome(raw);

  const entries = await listPlatformAudit({ outcome, limit: 100 });

  const filters = [
    { label: "All", value: undefined },
    { label: "Denied", value: "DENIED" },
    { label: "Failed", value: "FAILURE" },
    { label: "Succeeded", value: "SUCCESS" },
  ] as const;

  return (
    <div className="min-h-dvh bg-background">
      <PlatformNav currentPath="/super-admin/audit" />

      <main className="mx-auto max-w-5xl px-6 py-10 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The most recent {entries.length === 100 ? "100 " : ""}events across every tenant,
          newest first. Actions and outcomes only — never health data.
        </p>

        <nav aria-label="Filter by outcome" className="mt-6 flex flex-wrap gap-2">
          {filters.map((filter) => {
            const active = filter.value === outcome;
            return (
              <Link
                key={filter.label}
                href={filter.value ? `/super-admin/audit?outcome=${filter.value}` : "/super-admin/audit"}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        {entries.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {outcome
              ? `No ${outcome.toLowerCase()} events recorded.`
              : "Nothing recorded yet. Events appear here as soon as anybody signs in or acts."}
          </p>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-3xl text-sm">
              <caption className="sr-only">
                Platform audit events, newest first
              </caption>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">When</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Action</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Outcome</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Actor</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Domain</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Organisation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={entry.id} className="bg-card">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <th scope="row" className="px-4 py-2.5 text-left font-mono text-xs font-normal text-card-foreground">
                      {entry.action}
                    </th>
                    <td className="px-4 py-2.5">
                      {/* Word, not colour alone — the destructive tone is an emphasis on
                          top of the label, never the only carrier of meaning. */}
                      <span
                        className={
                          entry.outcome === "DENIED"
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {entry.outcome.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {entry.actorLabel ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {entry.actorDomain.toLowerCase()}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.organizationId ? (
                        <Link
                          href={`/super-admin/organizations/${entry.organizationId}`}
                          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {entry.organizationName ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">platform</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

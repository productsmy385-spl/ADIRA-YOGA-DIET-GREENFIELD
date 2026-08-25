import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { PlatformNav } from "@/components/nav/platform-nav";
import { Button } from "@/components/ui/button";
import { requirePlatformSession } from "@/server/auth/guards";
import { listTenantSummaries, platformHealth } from "@/server/repositories/analytics";
import { countRecentDenials } from "@/server/repositories/platform-audit";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

/**
 * The platform operator's console — the PLATFORM identity domain (ADR-001).
 *
 * Guarded by `requirePlatformSession`, not `requireRole`. Those read different cookies
 * signed with different secrets against different tables, and that is the whole boundary:
 * no tenant session, of any role, can reach this page. There is no code path that
 * upgrades one into the other.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT SHOW
 *
 * Customer names, health records, check-ins, or any individual's data. A platform owner
 * running the service needs to know a tenant exists, how large it is, and whether it is
 * alive. ADR-001 gives platform accounts no implicit reach into tenant data, and a
 * console that quietly listed customers would be exactly that reach arriving through the
 * back door — the "owner bypasses authorization" failure the brief warns against.
 *
 * Genuine support access to a tenant's data, when it is ever needed, must be a separate,
 * individually audited operation. Not a side effect of browsing.
 */

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn" ? "text-destructive" : "text-card-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function OwnerPage() {
  await requirePlatformSession();

  const [tenants, health, denials] = await Promise.all([
    listTenantSummaries(),
    platformHealth(),
    // R8's sibling: a denial spike is the other failure that is invisible unless somebody
    // is shown it. `audit_logs_denied_idx` makes the count cheap.
    countRecentDenials(24),
  ]);

  // R8: a stalled cron drain is otherwise undetectable — schedules live in the Railway
  // dashboard, invisible to git, and if one is removed the queue fills in silence.
  const queueStalled =
    health.oldestQueuedMinutes !== null && health.oldestQueuedMinutes > 30;

  return (
    <div className="min-h-dvh bg-background">
      <PlatformNav currentPath="/super-admin" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Platform
          </h1>

          {/* The operator's actual first action on an empty platform. It used to exist
              only as an unrendered form component, which is why this console read as a
              dashboard with nothing to do. */}
          <Button asChild size="sm">
            <Link href="/super-admin/organizations">
              <Building2 aria-hidden />
              Organisations
            </Link>
          </Button>
        </div>

        <section aria-label="Health" className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Organisations" value={String(health.organizations)} />
          <Stat label="Customers" value={String(health.totalCustomers)} />
          <Stat
            label="Queued jobs"
            value={String(health.queuedJobs)}
            tone={queueStalled ? "warn" : undefined}
          />
          <Stat
            label="Dead jobs"
            value={String(health.deadJobs)}
            tone={health.deadJobs > 0 ? "warn" : undefined}
          />
          <Stat
            label="Denied · 24h"
            value={String(denials)}
            tone={denials > 0 ? "warn" : undefined}
          />
        </section>

        {queueStalled && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            The oldest queued job has been waiting {health.oldestQueuedMinutes} minutes.
            The cron drain may have stopped — check the schedules in Railway against the
            table in <code>docs/RAILWAY.md</code>.
          </p>
        )}

        <section aria-labelledby="tenants-heading" className="mt-12">
          <h2
            id="tenants-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Organisations
          </h2>

          {tenants.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-2xl border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Organisation
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Customers
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Staff
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      Live plans
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">
                      <span className="sr-only">Manage</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr
                      key={tenant.organizationId}
                      className="border-b border-border last:border-0"
                    >
                      <th
                        scope="row"
                        className="px-5 py-3 text-left font-normal text-card-foreground"
                      >
                        {tenant.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {tenant.slug}
                        </span>
                      </th>
                      <td className="px-5 py-3 text-muted-foreground">
                        {tenant.status.toLowerCase()}
                      </td>
                      <td className="px-5 py-3 text-card-foreground">{tenant.customers}</td>
                      <td className="px-5 py-3 text-card-foreground">{tenant.staff}</td>
                      <td className="px-5 py-3 text-card-foreground">
                        {tenant.activeAssignments}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button asChild size="xs" variant="ghost">
                          <Link href={`/super-admin/organizations/${tenant.organizationId}`}>
                            Manage
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* An empty platform is the normal first state. It gets an ACTION, not a full
               stop — a bare "No organisations yet." was the whole reason this console
               looked like it did nothing. */
            <div className="mt-3 rounded-xl border border-dashed border-border p-10 text-center">
              <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-4 text-sm text-muted-foreground">
                No organisations yet. Creating one is the first step of onboarding a
                tenant.
              </p>
              <Button asChild size="sm" className="mt-5">
                <Link href="/super-admin/organizations">Create an organisation</Link>
              </Button>
            </div>
          )}
        </section>

        <p className="mt-10 border-t border-border pt-6 text-xs/relaxed text-muted-foreground">
          Counts only. This console shows no customer names, health records, or check-ins
          — platform accounts have no implicit reach into a tenant&rsquo;s data
          (decisions/ADR-001). Support access to an individual record is a separate,
          audited operation.
        </p>
      </main>
    </div>
  );
}

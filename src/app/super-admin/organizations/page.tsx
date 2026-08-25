import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { PlatformNav } from "@/components/nav/platform-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformSession } from "@/server/auth/guards";
import { listOrganizationSummaries } from "@/server/repositories/organizations";

import { CreateOrganizationForm } from "../platform-forms";

export const metadata: Metadata = { title: "Organisations" };
export const dynamic = "force-dynamic";

/**
 * Tenant provisioning — the platform console's primary job.
 *
 * `CreateOrganizationForm` and `createOrganizationAction` both already existed, were
 * audited and were covered by `super-admin/actions.test.ts`. Nothing rendered the form,
 * so there was no route in the product to create a tenant at all: the only way a new
 * organisation could exist was an operator typing INSERT against production. This page is
 * that missing wiring, not a new implementation.
 *
 * The form sits ABOVE the list rather than behind a dialog. An operator arriving here has
 * one of two intents — see the estate, or add to it — and on an empty platform the second
 * is the only one that makes sense.
 */

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  ACTIVE: "default",
  SUSPENDED: "outline",
  CLOSED: "outline",
};

export default async function OrganizationsPage() {
  await requirePlatformSession();

  const organizations = await listOrganizationSummaries();

  return (
    <div className="min-h-dvh bg-background">
      <PlatformNav currentPath="/super-admin/organizations" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Organisations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every tenant on the platform. Creating one here is the first step of onboarding —
          it gets its first administrator next.
        </p>

        <section
          aria-labelledby="create-heading"
          className="mt-8 rounded-xl border border-border bg-card p-6"
        >
          <h2 id="create-heading" className="text-sm font-medium text-card-foreground">
            Create an organisation
          </h2>
          <div className="mt-5">
            <CreateOrganizationForm />
          </div>
        </section>

        <section aria-labelledby="list-heading" className="mt-12">
          <h2
            id="list-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            {organizations.length === 0
              ? "Organisations"
              : `Organisations · ${organizations.length}`}
          </h2>

          {organizations.length === 0 ? (
            /* An empty platform is the NORMAL first state, not a broken one. The empty
               state says so and points at the form above rather than leaving a bare
               zero, which reads as a failure to load. */
            <div className="mt-3 rounded-xl border border-dashed border-border p-10 text-center">
              <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-4 text-sm text-muted-foreground">
                No organisations yet. Create the first one with the form above.
              </p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-2xl text-sm">
                <caption className="sr-only">
                  Organisations on the platform, with status and how many people each has
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Organisation
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Members
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      People
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      <span className="sr-only">Manage</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {organizations.map((organization) => (
                    <tr key={organization.id} className="bg-card">
                      <th scope="row" className="px-5 py-3 text-left font-normal">
                        <span className="font-medium text-card-foreground">
                          {organization.name}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {organization.slug}
                        </span>
                      </th>
                      <td className="px-5 py-3">
                        {/* Word, not colour — status is never conveyed by colour alone. */}
                        <Badge variant={STATUS_VARIANT[organization.status] ?? "outline"}>
                          {organization.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-muted-foreground">
                        {organization.customerCount}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-muted-foreground">
                        {organization.userCount}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button asChild size="xs" variant="ghost">
                          <Link href={`/super-admin/organizations/${organization.id}`}>
                            Manage
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-10 border-t border-border pt-6 text-xs/relaxed text-muted-foreground">
          Counts only. This console shows no customer names, health records or check-ins —
          platform accounts have no implicit reach into a tenant&rsquo;s data
          (decisions/ADR-001).
        </p>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PlatformNav } from "@/components/nav/platform-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePlatformSession } from "@/server/auth/guards";
import { listMembers } from "@/server/repositories/members";
import { listOrganizationSummaries } from "@/server/repositories/organizations";

import { AdminStatusControl } from "../organization-controls";
import { CreateAdminForm } from "../platform-forms";

export const metadata: Metadata = { title: "Administrators" };
export const dynamic = "force-dynamic";

/**
 * Every organisation administrator on the platform, in one list.
 *
 * The per-tenant view answers "who runs this organisation". This one answers "who runs
 * anything", which is the question an operator actually has when auditing access or
 * chasing an unactivated invitation across a dozen tenants.
 *
 * Built by asking each tenant for its STAFF rows rather than by adding a cross-tenant
 * query. `listMembers` already filters to ADMIN and ORG_OWNER in SQL and already takes
 * `organizationId` as a required leading predicate (ADR-004); a new unscoped variant would
 * be a function that exists to drop that predicate, which is the shape this codebase
 * deliberately avoids. The tenant count is small and bounded by the same page.
 */

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LOCKED: "Locked",
  DISABLED: "Deactivated",
  PENDING: "Pending",
};

export default async function AdministratorsPage() {
  await requirePlatformSession();

  const organizations = await listOrganizationSummaries();

  const perOrganization = await Promise.all(
    organizations.map(async (organization) => ({
      organization,
      staff: await listMembers(organization.id, { kind: "STAFF" }),
    })),
  );

  const rows = perOrganization.flatMap(({ organization, staff }) =>
    staff.map((admin) => ({ organization, admin })),
  );

  const pending = rows.filter((r) => r.admin.status === "INVITED").length;

  return (
    <div className="min-h-dvh bg-background">
      <PlatformNav currentPath="/super-admin/admins" />

      <main className="mx-auto max-w-5xl px-6 py-10 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Administrators
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who administers a tenant. An administrator belongs to exactly one
          organisation and is created here or on that organisation&rsquo;s page.
        </p>

        {pending > 0 && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
          >
            {pending} invited {pending === 1 ? "administrator has" : "administrators have"}{" "}
            not signed in yet. They activate by signing in — no activation is performed
            from here.
          </p>
        )}

        <section aria-labelledby="list-heading" className="mt-8">
          <h2 id="list-heading" className="sr-only">
            All administrators
          </h2>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <ShieldCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-4 text-sm text-muted-foreground">
                {organizations.length === 0
                  ? "No organisations yet, so there is nobody to administer one."
                  : "No administrators yet. Invite the first one below."}
              </p>
              {organizations.length === 0 && (
                <Button asChild size="sm" className="mt-5">
                  <Link href="/super-admin/organizations">Create an organisation</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-2xl text-sm">
                <caption className="sr-only">
                  Every organisation administrator, with their organisation and status
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Name</th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Email</th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Organisation
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      <span className="sr-only">Change status</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(({ organization, admin }) => (
                    <tr key={admin.id} className="bg-card">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-card-foreground">
                        {admin.fullName}
                      </th>
                      <td className="px-5 py-3 text-muted-foreground">{admin.email}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/super-admin/organizations/${organization.id}`}
                          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {organization.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={admin.status === "ACTIVE" ? "secondary" : "outline"}>
                          {STATUS_LABEL[admin.status] ?? admin.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end">
                          <AdminStatusControl
                            userId={admin.id}
                            organizationId={organization.id}
                            status={admin.status}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="invite-heading"
          className="mt-12 rounded-xl border border-border bg-card p-6"
        >
          <h2 id="invite-heading" className="text-sm font-medium text-card-foreground">
            Invite an administrator
          </h2>
          <div className="mt-5">
            <CreateAdminForm
              organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

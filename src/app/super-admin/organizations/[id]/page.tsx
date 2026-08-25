import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformNav } from "@/components/nav/platform-nav";
import { Badge } from "@/components/ui/badge";
import { requirePlatformSession } from "@/server/auth/guards";
import { listMembers } from "@/server/repositories/members";
import { findOrganizationById } from "@/server/repositories/organizations";
import { listPlatformAudit } from "@/server/repositories/platform-audit";

import {
  AdminStatusControl,
  OrganizationStatusControl,
} from "../../organization-controls";
import { CreateAdminForm } from "../../platform-forms";

export const metadata: Metadata = { title: "Organisation" };
export const dynamic = "force-dynamic";

/**
 * One tenant, for the platform operator.
 *
 * WHAT THIS PAGE SHOWS, AND THE LINE IT DOES NOT CROSS
 *
 * Administrators, by name, with the controls to provision and suspend them. That is
 * platform administration: an operator who cannot see who administers a tenant cannot
 * support it, and `super-admin/actions.ts` already scopes `setAdminStatusAction` to ADMIN
 * rows precisely so this surface cannot act on a member.
 *
 * NOT shown: members, their names, their practice, or anything derived from it. ADR-001
 * gives platform accounts no implicit reach into tenant data, and a console that listed
 * customers would be that reach arriving through the back door. `listMembers` is called
 * with `kind: "STAFF"`, which filters to ADMIN and ORG_OWNER in SQL — the restriction is
 * in the query, not in what this page chooses to render.
 *
 * The audit strip is the tenant's own trail, which records actions and resource ids, never
 * health data. See `platform-audit.ts`.
 */

const STATUS_LABEL: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LOCKED: "Locked",
  DISABLED: "Deactivated",
  PENDING: "Pending",
};

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformSession();
  const { id } = await params;

  const organization = await findOrganizationById(id);
  if (!organization) notFound();

  const [staff, audit] = await Promise.all([
    listMembers(organization.id, { kind: "STAFF" }),
    listPlatformAudit({ organizationId: organization.id, limit: 10 }),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <PlatformNav currentPath="/super-admin/organizations" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-24">
        <Link
          href="/super-admin/organizations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Organisations
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {organization.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">{organization.slug}</span> ·{" "}
              {organization.timezone} · {organization.locale}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge variant={organization.status === "ACTIVE" ? "default" : "outline"}>
              {organization.status.toLowerCase()}
            </Badge>
            <OrganizationStatusControl
              organizationId={organization.id}
              status={organization.status}
            />
          </div>
        </div>

        {organization.status !== "ACTIVE" && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm/relaxed text-muted-foreground"
          >
            This organisation is {organization.status.toLowerCase()}. Nobody in it can sign
            in, and live sessions stopped resolving at their next request. No data has been
            deleted — reactivating restores access.
          </p>
        )}

        <section
          aria-labelledby="admins-heading"
          className="mt-12"
        >
          <h2
            id="admins-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Administrators {staff.length > 0 ? `· ${staff.length}` : ""}
          </h2>

          {staff.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No administrators yet. Invite the first one below — until then nobody can
              administer this organisation.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-2xl text-sm">
                <caption className="sr-only">
                  Administrators of {organization.name}, with status
                </caption>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Name</th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Email</th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Role</th>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      <span className="sr-only">Change status</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((admin) => (
                    <tr key={admin.id} className="bg-card">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-card-foreground">
                        {admin.fullName}
                      </th>
                      <td className="px-5 py-3 text-muted-foreground">{admin.email}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {admin.role.toLowerCase().replace("_", " ")}
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

          <div className="mt-5 rounded-xl border border-border bg-card p-6">
            <h3 className="text-sm font-medium text-card-foreground">
              Invite an administrator
            </h3>
            {/*
              The form takes a list so it can be reused on a platform-wide page. Passing
              only this tenant scopes it here without a second component — and without a
              second code path that could post a different organisation id.
            */}
            <div className="mt-5">
              <CreateAdminForm
                organizations={[{ id: organization.id, name: organization.name }]}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="audit-heading" className="mt-12">
          <h2
            id="audit-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Recent activity
          </h2>

          {audit.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing recorded for this organisation yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-3">
                  <span className="font-mono text-xs text-card-foreground">
                    {entry.action}
                  </span>
                  <span
                    className={`text-xs ${
                      entry.outcome === "DENIED"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {entry.outcome.toLowerCase()}
                  </span>
                  <span className="type-meta ml-auto text-muted-foreground">
                    {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs/relaxed text-muted-foreground">
            Actions and outcomes only. Audit rows never carry health data — see the full
            trail under{" "}
            <Link href="/super-admin/audit" className="underline hover:text-foreground">
              Audit
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}

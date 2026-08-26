import type { Metadata } from "next";

import { CaseloadList } from "@/components/caseload/caseload-list";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { listCaseload } from "@/server/repositories/caseload";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

/**
 * The staff dashboard.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * DELIBERATELY THE SMALLEST DASHBOARD IN THE PRODUCT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * STAFF watches a caseload and supports the people on it. It authors nothing:
 * `canManageProgrammes` and `canPrescribe` both deny this role, so there is no library
 * link, no "create programme", no assign form. Those are not hidden — they are not
 * fetched, not rendered, and would be refused at the action if they were posted.
 *
 * What remains is genuinely everything the role can do, which is the property worth
 * having. A dashboard offering controls that redirect teaches people to distrust the
 * interface.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SAME ASSIGNMENT BOUNDARY AS EVERY OTHER ROLE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `listCaseload` scopes by `consultant_assignments` in SQL. A staff member with no
 * assignments sees nobody — not a filtered-down list, an empty one — and opening any
 * member still passes `resolveMemberAccess` on arrival. Being STAFF grants no reach on
 * its own; it only makes the role eligible to be granted some by an assignment
 * (`carriesCaseload`).
 */
export default async function StaffPage() {
  const session = await requireRole("STAFF");
  const caseload = await listCaseload(actorFromSession(session));

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/staff" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {caseload.length === 0
            ? `Nobody at ${session.organizationName} is assigned to you yet.`
            : `${caseload.length} ${caseload.length === 1 ? "person" : "people"} assigned to you at ${session.organizationName}.`}
        </p>

        <CaseloadList
          entries={caseload}
          emptyMessage="No customers are assigned to you yet. An administrator assigns them."
        />

        <p className="mt-6 text-xs/relaxed text-muted-foreground">
          You can follow the practice of the people assigned to you and message them.
          Building and prescribing programmes is done by a trainer or an administrator.
        </p>
      </main>

      <MobileTabBar role={session.role} currentPath="/staff" />
    </div>
  );
}

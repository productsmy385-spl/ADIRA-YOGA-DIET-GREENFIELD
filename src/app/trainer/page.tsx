import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, ClipboardList, Salad } from "lucide-react";

import { CaseloadList } from "@/components/caseload/caseload-list";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { actorFromSession } from "@/server/authorization/member-access";
import { listCaseload } from "@/server/repositories/caseload";
import { listProgrammes } from "@/server/repositories/programmes";

export const metadata: Metadata = { title: "My customers" };
export const dynamic = "force-dynamic";

/**
 * The trainer's dashboard.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT MAKES THIS A DIFFERENT PAGE FROM `/admin`, AND WHAT DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The caseload itself is IDENTICAL and is the same component, because the question is the
 * same one: who am I responsible for, and who needs me today. `listCaseload` scopes by
 * `consultant_assignments` for every role, so a trainer's list is theirs by the same
 * mechanism an admin's is.
 *
 * What is absent is the point. `/admin` also carries organisation administration —
 * member counts, invited accounts, pending access requests, "add member". A TRAINER has
 * `canManageOrganization` false, so every one of those controls would redirect. They are
 * not hidden here; there was never a version of this page that fetched them.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE GUARD IS EXACT, NOT A RANK THRESHOLD
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `requireRole("TRAINER")` admits trainers only. An ADMIN reaching this URL is redirected
 * to their own home rather than shown a subset of their own dashboard — two roles sharing
 * a route is how "which page am I on" stops predicting "what am I allowed to do".
 */
export default async function TrainerPage() {
  const session = await requireRole("TRAINER");
  const actor = actorFromSession(session);

  const [caseload, publishedProgrammes] = await Promise.all([
    listCaseload(actor),
    // Library counts only — a template belongs to the organisation and names nobody, so
    // this is not member data and needs no assignment.
    listProgrammes(session.organizationId, undefined, false, true),
  ]);

  const yoga = publishedProgrammes.filter((p) => p.kind === "YOGA").length;
  const diet = publishedProgrammes.filter((p) => p.kind === "DIET").length;

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/trainer" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          My customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {caseload.length === 0
            ? `Nobody at ${session.organizationName} is assigned to you yet.`
            : `${caseload.length} ${caseload.length === 1 ? "person" : "people"} assigned to you at ${session.organizationName}.`}
        </p>

        <section aria-labelledby="library" className="mt-8">
          <h2
            id="library"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Plans you can build
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/programmes/new">
                <CalendarPlus aria-hidden />
                Create programme
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/yoga/new">
                <ClipboardList aria-hidden />
                Add exercise
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/diet/new">
                <Salad aria-hidden />
                Add meal
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {publishedProgrammes.length === 0 ? (
              <>
                No published programmes yet — a programme must be published before it can
                be assigned.{" "}
                <Link href="/admin/programmes" className="underline hover:text-foreground">
                  Go to programmes
                </Link>
              </>
            ) : (
              <>
                {yoga} yoga and {diet} diet{" "}
                {publishedProgrammes.length === 1 ? "programme" : "programmes"} published
                and ready to assign.
              </>
            )}
          </p>
        </section>

        <CaseloadList
          entries={caseload}
          emptyMessage="No customers are assigned to you yet. An administrator assigns them."
        />
      </main>

      <MobileTabBar role={session.role} currentPath="/trainer" />
    </div>
  );
}

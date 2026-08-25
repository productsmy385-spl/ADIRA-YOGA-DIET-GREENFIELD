import type { Metadata } from "next";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { requireRole } from "@/server/auth/guards";
import { listAccessRequests } from "@/server/repositories/access-requests";

import { ReviewCard, type RequestView } from "./review-card";

export const metadata: Metadata = { title: "Access requests" };
export const dynamic = "force-dynamic";

/**
 * The admin review queue.
 *
 * Administrative, so organization-wide and needing no assignment — a request is not member
 * data, because nobody has become a member yet.
 *
 * The scope comes from the session and is never read from the URL, so there is no
 * parameter to tamper with. Everything rendered here was submitted by the applicant
 * themselves; nothing is joined from any other table.
 */

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AccessRequestsPage() {
  const session = await requireRole("ADMIN");

  const requests = await listAccessRequests(session.organizationId);
  const pending = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  const toView = (r: (typeof requests)[number]): RequestView => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    reason: r.reason,
    status: r.status,
    createdAt: formatDate(r.createdAt),
    reviewedAt: r.reviewedAt ? formatDate(r.reviewedAt) : null,
    reviewNotes: r.reviewNotes,
  });

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/access-requests" />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Access requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People asking to join {session.organizationName}.
        </p>

        <section aria-labelledby="pending-heading" className="mt-8">
          <h2
            id="pending-heading"
            className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
          >
            Awaiting review {pending.length > 0 ? `(${pending.length})` : ""}
          </h2>

          {pending.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No requests are waiting. New ones appear here when someone submits the
              organisation code.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {pending.map((r) => (
                <ReviewCard key={r.id} request={toView(r)} />
              ))}
            </ul>
          )}
        </section>

        {decided.length > 0 ? (
          <section aria-labelledby="decided-heading" className="mt-10">
            <h2
              id="decided-heading"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
            >
              Decided
            </h2>
            <ul className="mt-4 space-y-4">
              {decided.map((r) => (
                <ReviewCard key={r.id} request={toView(r)} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/access-requests" />
    </div>
  );
}

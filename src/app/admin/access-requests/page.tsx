import type { Metadata } from "next";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { PageHeader } from "@/components/ui/page-header";
import { OrganizationAccessKeyCard } from "@/components/ui/organization-access-key-card";
import { requireRole } from "@/server/auth/guards";
import { listAccessRequests } from "@/server/repositories/access-requests";
import { getJoinCode } from "@/server/repositories/organizations";

import { ReviewCard, type RequestView } from "./review-card";
import { regenerateJoinCodeAction } from "./actions";

export const metadata: Metadata = { title: "Access requests" };
export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AccessRequestsPage() {
  const session = await requireRole("ADMIN");

  const [requests, joinCode] = await Promise.all([
    listAccessRequests(session.organizationId),
    getJoinCode(session.organizationId),
  ]);

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
    <div className="theme-bg-wrapper theme-fresh-green min-h-dvh bg-background sm:pl-[260px] pt-14 sm:pt-0">
      <AppNav role={session.role} currentPath="/admin/access-requests" />

      <main className="mx-auto max-w-3xl px-6 py-10 pb-28 sm:pb-10">
        <PageHeader
          title="Access requests"
          description={`People asking to join ${session.organizationName}.`}
        />

        {/* Organization Access Key Management Card */}
        <OrganizationAccessKeyCard
          joinCode={joinCode}
          onRegenerateAction={regenerateJoinCodeAction}
        />

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

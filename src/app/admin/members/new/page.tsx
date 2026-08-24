import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { requireRole } from "@/server/auth/guards";

import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "Add a member" };
export const dynamic = "force-dynamic";

/**
 * Add one member — the administrative counterpart to the bulk import.
 *
 * `requireRole("ADMIN")` is the correct gate: creating an account is shaping the
 * organization, not reading anyone's health record. The route guard is the enforcement;
 * the presence or absence of a link enforces nothing (see `nav-items.ts`).
 */
export default async function AddMemberPage() {
  const session = await requireRole("ADMIN");

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/members" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/members" className="hover:text-foreground">
            Members
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">Add a member</span>
        </nav>

        <header className="mt-3">
          <h1 className="type-display text-foreground">Add a member</h1>
          <p className="type-body mt-2 max-w-prose text-muted-foreground">
            They are invited, not activated. Nobody is signed in on their behalf — the
            account becomes active the first time they sign in with this email address.
          </p>
        </header>

        <GlassPanel className="mt-8 p-6">
          <AddMemberForm />
        </GlassPanel>

        <GlassPanel className="mt-6 p-5">
          <h2 className="text-sm font-medium text-foreground">What happens next</h2>
          <ul className="type-body mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              They appear in your member list as <strong>Invited</strong> straight away.
            </li>
            <li>
              They sign in with their email address and a one-time code. That code is what
              activates the account — no password is created and no link is sent that
              could be forwarded.
            </li>
            <li>
              Reading their practice needs an assignment. Being an administrator lets you
              administer the organisation, not open anybody&rsquo;s health record.
            </li>
            <li>
              Adding several people at once?{" "}
              <Link
                href="/admin/members/import"
                className="font-medium text-primary underline underline-offset-4"
              >
                Import a CSV
              </Link>
              .
            </li>
          </ul>
        </GlassPanel>
      </main>
    </div>
  );
}

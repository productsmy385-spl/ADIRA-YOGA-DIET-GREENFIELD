import type { Metadata } from "next";

import Link from "next/link";

import { GlassPanel } from "@/components/glass/glass";
import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { MemberImport } from "@/components/members/member-import";
import { requireRole } from "@/server/auth/guards";

/**
 * Bulk member import (Phase 13, §23).
 *
 * ADMINISTRATIVE, so `requireRole("ADMIN")` is the right gate here — creating accounts is
 * shaping the organization, not reading anybody's health record. The route guard is the
 * enforcement; the absence of a link for a member enforces nothing (see `nav-items.ts`).
 *
 * The interesting work is on the client, because previewing a file the operator has not
 * uploaded anywhere yet is exactly what a browser is for. Everything that decides
 * anything still happens on the server: `/api/members/import/preview` classifies, and
 * `/api/members/import` re-parses the same bytes rather than trusting a row list.
 */

export const metadata: Metadata = {
  title: "Import members",
};

export default async function ImportMembersPage() {
  const session = await requireRole("ADMIN");

  return (
    <div className="min-h-dvh bg-background">
      {/* The shared shell. Without it this page was a cul-de-sac: no navigation, and no
          way back to Members except the browser's back button. */}
      <AppNav role={session.role} currentPath="/admin/members" />

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10 pb-28 sm:pb-10">
      <header>
        <Link
          href="/admin/members"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Members
        </Link>
        <h1 className="type-display mt-3 text-foreground">Import members</h1>
        <p className="type-body mt-2 max-w-prose text-muted-foreground">
          Upload a spreadsheet to invite several people at once. You will see exactly what
          would be created before anything is.
        </p>
      </header>

      <GlassPanel className="space-y-6 p-6">
        <MemberImport />

        <div className="border-t border-border pt-5">
          <h2 className="text-sm font-medium text-foreground">Not sure of the format?</h2>
          <p className="type-meta mt-1 text-muted-foreground">
            Download a template with the right columns and one example row.
          </p>
          {/*
            A normal link to a route that sets Content-Disposition, rather than a
            client-side blob. It works with the keyboard, it works with JavaScript
            disabled, and the browser's own download UI is the one the operator knows.
          */}
          <a
            href="/api/members/import/template"
            className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
          >
            Download the CSV template
          </a>
        </div>
      </GlassPanel>

      <GlassPanel className="p-5">
        <h2 className="text-sm font-medium text-foreground">What an import does</h2>
        <ul className="type-body mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Everyone is created as invited. Nobody is signed in or activated by it.</li>
          <li>
            An address that already belongs to someone here is left exactly as it is — an
            import never overwrites an existing member.
          </li>
          <li>
            Rows with errors are skipped and reported by line number. The rest still
            import.
          </li>
          <li>It happens in one go, or not at all. A failure part-way leaves nothing behind.</li>
        </ul>
      </GlassPanel>
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/members" />
    </div>
  );
}

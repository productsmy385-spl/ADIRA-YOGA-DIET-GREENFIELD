import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { requireRole } from "@/server/auth/guards";

import { NewProgrammeForm } from "./new-programme-form";

export const metadata: Metadata = { title: "New programme" };
export const dynamic = "force-dynamic";

/**
 * Start a programme.
 *
 * Deliberately only the shell — name, kind, length, difficulty. Exercises and meals are
 * added in the builder, because choosing a week-2-day-3 position for eight items on the
 * same screen as naming the thing is how a create form becomes unusable.
 *
 * The KIND is fixed here and never editable afterwards: a yoga programme whose items are
 * exercises cannot become a diet plan without emptying it, so offering the switch later
 * would only be a way to break a template.
 */
export default async function NewProgrammePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await requireRole("ADMIN", "TRAINER");
  const { kind } = await searchParams;

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/programmes" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/programmes" className="hover:text-foreground">
            Programmes
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">New</span>
        </nav>

        <header className="mt-3">
          <h1 className="type-display text-foreground">New programme</h1>
          <p className="type-body mt-2 max-w-prose text-muted-foreground">
            Name it and set its shape. You will add exercises or meals next.
          </p>
        </header>

        <GlassPanel className="mt-8 p-6">
          <NewProgrammeForm defaultKind={kind === "DIET" ? "DIET" : "YOGA"} />
        </GlassPanel>
      </main>
    </div>
  );
}

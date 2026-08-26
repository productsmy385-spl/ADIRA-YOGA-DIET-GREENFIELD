import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { requireRole } from "@/server/auth/guards";
import { findYogaExercise } from "@/server/repositories/library";

import { ExerciseForm } from "../exercise-form";

export const metadata: Metadata = { title: "Edit a yoga exercise" };
export const dynamic = "force-dynamic";

/**
 * Edit one exercise.
 *
 * The lookup is scoped to the session's organisation, so an id belonging to another tenant
 * is simply not found — a 404 rather than a 403, because whether it exists elsewhere is
 * not something to disclose (ADR-004).
 */
export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("ADMIN", "TRAINER");
  const { id } = await params;

  const exercise = await findYogaExercise(session.organizationId, id);
  if (!exercise) notFound();

  return (
    <div className="theme-bg-wrapper theme-blue-calm min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/yoga" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/yoga" className="hover:text-foreground">
            Yoga library
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">{exercise.name}</span>
        </nav>

        <header className="mt-3">
          <h1 className="type-display text-foreground">Edit exercise</h1>
          {/*
            ADR-009: a programme item snapshots its content when an assignment is created,
            so editing here cannot rewrite a plan somebody is already following. Saying so
            prevents the opposite fear, which stops admins from correcting typos.
          */}
          <p className="type-body mt-2 max-w-prose text-muted-foreground">
            Changes apply to programmes built from now on. Plans already assigned keep the
            wording they were assigned with.
          </p>
        </header>

        <GlassPanel className="mt-8 p-6">
          <ExerciseForm exercise={exercise} />
        </GlassPanel>
      </main>
    </div>
  );
}

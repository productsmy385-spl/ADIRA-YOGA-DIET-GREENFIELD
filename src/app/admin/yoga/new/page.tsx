import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { requireRole } from "@/server/auth/guards";

import { ExerciseForm } from "../exercise-form";

export const metadata: Metadata = { title: "Add a yoga exercise" };
export const dynamic = "force-dynamic";

/**
 * Add to the organisation's yoga library.
 *
 * Purely administrative: an exercise describes nobody and carries no health data, so
 * `requireRole("ADMIN")` is the entire authorization question and no assignment is involved.
 */
export default async function NewExercisePage() {
  const session = await requireRole("ADMIN");

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/yoga" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/yoga" className="hover:text-foreground">
            Yoga library
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">Add an exercise</span>
        </nav>

        <header className="mt-3">
          <h1 className="type-display text-foreground">Add an exercise</h1>
          <p className="type-body mt-2 max-w-prose text-muted-foreground">
            Exercises are the building blocks of a programme. Adding one here does not
            assign it to anybody.
          </p>
        </header>

        <GlassPanel className="mt-8 p-6">
          <ExerciseForm />
        </GlassPanel>
      </main>
    </div>
  );
}

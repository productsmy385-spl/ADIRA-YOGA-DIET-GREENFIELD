import type { Metadata } from "next";
import { Flower2 } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/guards";
import { listYogaExercises } from "@/server/repositories/library";

export const metadata: Metadata = { title: "Yoga library" };
export const dynamic = "force-dynamic";

/**
 * The organisation's yoga library.
 *
 * A LIBRARY, not member data. These are the exercises an admin can build programmes from,
 * owned by the organisation rather than by any person — so it is administrative and needs
 * no assignment. Nothing here reveals who has been given what.
 */
export default async function YogaLibraryPage() {
  const session = await requireRole("ADMIN");
  const exercises = await listYogaExercises(session.organizationId);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/yoga" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Yoga library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exercises available to {session.organizationName} when building a programme.
        </p>

        {exercises.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Flower2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              The library is empty. Exercises added here become the building blocks of every
              programme.
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {exercises.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-card-foreground">{e.name}</h2>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {e.difficulty}
                  </Badge>
                </div>

                {e.description ? (
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">{e.description}</p>
                ) : null}

                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {e.defaultDurationSeconds !== null ? (
                    <div className="flex gap-1.5">
                      <dt>Duration</dt>
                      <dd className="tabular-nums text-card-foreground">
                        {Math.round(e.defaultDurationSeconds / 60)} min
                      </dd>
                    </div>
                  ) : null}
                  {e.defaultRepetitions !== null ? (
                    <div className="flex gap-1.5">
                      <dt>Repetitions</dt>
                      <dd className="tabular-nums text-card-foreground">
                        {e.defaultRepetitions}
                      </dd>
                    </div>
                  ) : null}
                  {e.breathing ? (
                    <div className="flex gap-1.5">
                      <dt>Breathing</dt>
                      <dd className="text-card-foreground">{e.breathing}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

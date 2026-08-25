import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { listMeals, listYogaExercises } from "@/server/repositories/library";
import {
  findProgramme,
  lifecycleOf,
  listProgrammeItems,
} from "@/server/repositories/programmes";

import { archiveProgrammeAction, removeProgrammeItemAction } from "../actions";
import { AddItemForm } from "./add-item-form";
import { ProgrammeDetailsForm } from "./programme-details-form";
import { PublishControls } from "./publish-controls";

export const metadata: Metadata = { title: "Programme builder" };
export const dynamic = "force-dynamic";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * The programme builder.
 *
 * ITEMS ARE GROUPED BY WEEK AND DAY, because that is the shape of the thing being built. A
 * flat list ordered by position is what the database returns and it is unreadable past
 * about a dozen items — a consultant checks "what does week 2 Tuesday look like", and the
 * page should answer that without counting rows.
 *
 * Only days that HAVE something are shown. Rendering 7 empty days for every week of a
 * 12-week programme would be 84 rows of nothing, and the add form already covers putting
 * something in an empty day.
 *
 * The lookup is organisation-scoped, so another tenant's programme id is a 404 rather than
 * a 403 — whether it exists elsewhere is not something to disclose (ADR-004).
 */
export default async function ProgrammeBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("ADMIN");
  const { id } = await params;

  const programme = await findProgramme(session.organizationId, id);
  if (!programme) notFound();

  const isYoga = programme.kind === "YOGA";

  // Only the library this programme can actually use, and only what is not archived —
  // offering an archived exercise would let a template be built from something the
  // organisation has withdrawn.
  const [items, exercises, meals] = await Promise.all([
    listProgrammeItems(session.organizationId, id),
    isYoga ? listYogaExercises(session.organizationId) : Promise.resolve([]),
    isYoga ? Promise.resolve([]) : listMeals(session.organizationId),
  ]);

  // Group by week, then day. A Map preserves the insertion order, and the query already
  // returns rows ordered by (week, day, sequence).
  const weeks = new Map<number, Map<number, typeof items>>();
  for (const item of items) {
    const week = weeks.get(item.weekNumber) ?? new Map<number, typeof items>();
    week.set(item.dayOfWeek, [...(week.get(item.dayOfWeek) ?? []), item]);
    weeks.set(item.weekNumber, week);
  }

  const libraryEmpty = isYoga ? exercises.length === 0 : meals.length === 0;
  const lifecycle = lifecycleOf(programme);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/programmes" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/programmes" className="hover:text-foreground">
            Programmes
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">{programme.name}</span>
        </nav>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="type-display text-foreground">{programme.name}</h1>
            <p className="type-meta mt-1 text-muted-foreground">
              {isYoga ? "Yoga programme" : "Diet plan"} · {programme.durationWeeks} week
              {programme.durationWeeks === 1 ? "" : "s"} · {items.length} item
              {items.length === 1 ? "" : "s"} · version {programme.version}
            </p>
          </div>

          <div className="flex items-start gap-2">
            {/* The state, as a word. It is derived from two timestamps rather than
                stored, so it cannot contradict the buttons beside it (migration 009). */}
            <Badge
              variant={
                lifecycle === "PUBLISHED"
                  ? "default"
                  : lifecycle === "ARCHIVED"
                    ? "secondary"
                    : "outline"
              }
            >
              {lifecycle.toLowerCase()}
            </Badge>

            <PublishControls
              programmeId={programme.id}
              lifecycle={lifecycle}
              itemCount={items.length}
            />

            <form action={archiveProgrammeAction}>
              <input type="hidden" name="programmeId" value={programme.id} />
              <input
                type="hidden"
                name="archived"
                value={programme.archivedAt ? "false" : "true"}
              />
              <Button type="submit" size="sm" variant="outline">
                {programme.archivedAt ? "Restore" : "Archive"}
              </Button>
            </form>
          </div>
        </div>

        {/*
          The consequence of the state, where the state is read. A DRAFT programme is
          invisible to the assign form, and an admin who does not know that experiences it
          as their new programme having silently failed to exist.
        */}
        {lifecycle === "DRAFT" && (
          <p className="type-meta mt-4 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
            This is a draft. It cannot be assigned to anybody until it is published.
          </p>
        )}

        {/*
          ADR-009 stated where it matters. Without this an admin either fears editing a
          live template, or assumes an edit reaches everyone already on it — and both
          misunderstandings change what they are willing to do.
        */}
        <p className="type-meta mt-4 rounded-lg border border-border bg-muted/40 p-3 text-muted-foreground">
          Editing this template does not change anybody&rsquo;s current plan. Assignments keep
          a copy of what they were given, so changes here apply to assignments made from now
          on. The version number is how an assignment records which one it came from.
        </p>

        <GlassPanel className="mt-8 p-6">
          <h2 className="type-heading text-foreground">Details</h2>
          <div className="mt-4">
            <ProgrammeDetailsForm programme={programme} />
          </div>
        </GlassPanel>

        <section className="mt-8">
          <h2 className="type-heading text-foreground">
            {isYoga ? "Exercises" : "Meals"} by week
          </h2>

          {items.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing scheduled yet. Add the first {isYoga ? "exercise" : "meal"} below.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-6">
              {[...weeks.entries()].map(([weekNumber, days]) => (
                <div key={weekNumber}>
                  <h3 className="text-sm font-medium text-foreground">Week {weekNumber}</h3>

                  <div className="mt-2 space-y-3">
                    {[...days.entries()].map(([dayOfWeek, dayItems]) => (
                      <div
                        key={dayOfWeek}
                        className="rounded-xl border border-border bg-card p-4"
                      >
                        <h4 className="text-sm font-medium text-card-foreground">
                          {DAY_NAMES[dayOfWeek]}
                        </h4>

                        <ol className="mt-2 divide-y divide-border">
                          {dayItems.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center gap-3 py-2"
                            >
                              <span className="type-meta w-6 shrink-0 tabular-nums text-muted-foreground">
                                {item.sequence + 1}
                              </span>

                              <div className="min-w-40 flex-1">
                                <p className="text-sm text-card-foreground">{item.title}</p>
                                {item.notes ? (
                                  <p className="type-meta mt-0.5 text-muted-foreground">
                                    {item.notes}
                                  </p>
                                ) : null}
                              </div>

                              {item.slot ? (
                                <Badge variant="outline" className="text-xs">
                                  {item.slot}
                                </Badge>
                              ) : null}

                              {item.durationSeconds ? (
                                <span className="type-meta tabular-nums text-muted-foreground">
                                  {Math.round(item.durationSeconds / 60)} min
                                </span>
                              ) : null}

                              {item.repetitions ? (
                                <span className="type-meta tabular-nums text-muted-foreground">
                                  ×{item.repetitions}
                                </span>
                              ) : null}

                              <form action={removeProgrammeItemAction}>
                                <input
                                  type="hidden"
                                  name="programmeId"
                                  value={programme.id}
                                />
                                <input type="hidden" name="itemId" value={item.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  Remove
                                </Button>
                              </form>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <GlassPanel className="mt-8 p-6">
          <h2 className="type-heading text-foreground">
            Add {isYoga ? "an exercise" : "a meal"}
          </h2>

          {libraryEmpty ? (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Your {isYoga ? "yoga" : "diet"} library is empty, so there is nothing to add
                yet.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href={isYoga ? "/admin/yoga/new" : "/admin/diet/new"}>
                  Add to the library first
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <AddItemForm
                programmeId={programme.id}
                durationWeeks={programme.durationWeeks}
                kind={programme.kind}
                exercises={exercises.map((e) => ({
                  id: e.id,
                  name: e.name,
                  defaultDurationSeconds: e.defaultDurationSeconds,
                  defaultRepetitions: e.defaultRepetitions,
                }))}
                meals={meals.map((m) => ({ id: m.id, name: m.name, slot: m.slot }))}
              />
            </div>
          )}
        </GlassPanel>
      </main>
    </div>
  );
}

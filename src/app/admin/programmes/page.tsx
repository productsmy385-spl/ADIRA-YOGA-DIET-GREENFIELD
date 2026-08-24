import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { listProgrammes } from "@/server/repositories/programmes";

import { archiveProgrammeAction, duplicateProgrammeAction } from "./actions";

export const metadata: Metadata = { title: "Programmes" };
export const dynamic = "force-dynamic";

/**
 * Yoga programmes and diet plans, in one list.
 *
 * They share a table and differ by `kind`, so listing them separately would be two pages
 * maintaining one concept. Grouped by kind for readability; the underlying builder is the
 * same for both.
 *
 * ADMINISTRATIVE — templates, not member data. Nothing here says who has been assigned
 * what; the item count is a number about the template itself.
 */
export default async function ProgrammesPage() {
  const session = await requireRole("ADMIN");
  // Archived templates stay listed and restorable, as in the libraries.
  const programmes = await listProgrammes(session.organizationId, undefined, true);

  const groups = [
    { kind: "YOGA" as const, label: "Yoga programmes" },
    { kind: "DIET" as const, label: "Diet plans" },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/programmes" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Programmes
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reusable plans built once and assigned many times. Editing one never changes a
              plan somebody is already following.
            </p>
          </div>

          <Button asChild size="sm">
            <Link href="/admin/programmes/new">
              <Plus aria-hidden />
              New programme
            </Link>
          </Button>
        </div>

        {programmes.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              No programmes yet. Build one from the exercises and meals in your library.
            </p>
            <Button asChild size="sm" className="mt-5">
              <Link href="/admin/programmes/new">Build the first programme</Link>
            </Button>
          </div>
        ) : (
          groups.map((group) => {
            const items = programmes.filter((p) => p.kind === group.kind);
            if (items.length === 0) return null;

            return (
              <section key={group.kind} className="mt-10">
                <h2 className="text-sm font-medium text-muted-foreground">{group.label}</h2>

                <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                  {items.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-48 flex-1">
                        <Link
                          href={`/admin/programmes/${p.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {p.name}
                        </Link>
                        <p className="type-meta mt-1 text-muted-foreground">
                          {p.durationWeeks} week{p.durationWeeks === 1 ? "" : "s"} ·{" "}
                          {p.itemCount} item{p.itemCount === 1 ? "" : "s"} · v{p.version}
                        </p>
                      </div>

                      <Badge variant="outline" className="text-xs">
                        {p.difficulty}
                      </Badge>

                      {/*
                        An empty template is called out rather than left to look finished.
                        Assigning one would give a member a plan with nothing in it.
                      */}
                      {p.itemCount === 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          Empty
                        </Badge>
                      ) : null}

                      {p.archivedAt ? (
                        <Badge variant="secondary" className="text-xs">
                          Archived
                        </Badge>
                      ) : null}

                      <div className="flex items-center gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/programmes/${p.id}`}>Open</Link>
                        </Button>

                        <form action={duplicateProgrammeAction}>
                          <input type="hidden" name="programmeId" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            Duplicate
                          </Button>
                        </form>

                        <form action={archiveProgrammeAction}>
                          <input type="hidden" name="programmeId" value={p.id} />
                          <input
                            type="hidden"
                            name="archived"
                            value={p.archivedAt ? "false" : "true"}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            {p.archivedAt ? "Restore" : "Archive"}
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

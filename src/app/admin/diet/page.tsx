import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Salad } from "lucide-react";

import { AppNav, MobileTabBar } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/guards";
import { listMeals } from "@/server/repositories/library";

import { archiveMealAction } from "../library-actions";

import { AddMealForm } from "./add-meal";

export const metadata: Metadata = { title: "Diet library" };
export const dynamic = "force-dynamic";

/**
 * The organisation's meal library.
 *
 * Like the yoga library, this is organisation-owned reference data rather than anyone's
 * plan. It shows what CAN be assigned, never what HAS been assigned to whom — that would
 * be member data and would need an assignment.
 */
export default async function DietLibraryPage() {
  const session = await requireRole("ADMIN", "TRAINER");
  // Archived meals are listed, greyed and restorable — see the yoga library for why.
  const meals = await listMeals(session.organizationId, true);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/diet" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Diet library
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Meals available to {session.organizationName} when building a plan.
            </p>
          </div>

        <AddMealForm />

          <Button asChild size="sm">
            <Link href="/admin/diet/new">
              <Plus aria-hidden />
              Add meal
            </Link>
          </Button>
        </div>

        {meals.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Salad className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              The library is empty. Meals added here become the building blocks of every diet
              plan.
            </p>
            <Button asChild size="sm" className="mt-5">
              <Link href="/admin/diet/new">Add the first meal</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {meals.map((m) => (
              <li key={m.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium text-card-foreground">{m.name}</h2>
                  {m.slot ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {m.slot}
                    </Badge>
                  ) : null}
                </div>

                {m.description ? (
                  <p className="mt-2 text-sm/relaxed text-muted-foreground">{m.description}</p>
                ) : null}

                {m.quantity ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Quantity <span className="text-card-foreground">{m.quantity}</span>
                  </p>
                ) : null}

                {m.tags.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {m.tags.map((t) => (
                      <li key={t}>
                        <Badge variant="secondary" className="text-xs">{t}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/diet/${m.id}`}>Edit</Link>
                  </Button>

                  {/* A form rather than a link: archiving changes state, and a GET that
                      mutates is one a browser or crawler eventually fires by itself. */}
                  <form action={archiveMealAction}>
                    <input type="hidden" name="mealId" value={m.id} />
                    <input
                      type="hidden"
                      name="archived"
                      value={m.archivedAt ? "false" : "true"}
                    />
                    <Button type="submit" size="sm" variant="ghost">
                      {m.archivedAt ? "Restore" : "Archive"}
                    </Button>
                  </form>

                  {m.archivedAt ? (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      Archived
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <MobileTabBar role={session.role} currentPath="/admin/diet" />
    </div>
  );
}

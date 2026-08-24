import type { Metadata } from "next";
import { Salad } from "lucide-react";

import { AppNav } from "@/components/nav/app-nav";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/guards";
import { listMeals } from "@/server/repositories/library";

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
  const session = await requireRole("ADMIN");
  const meals = await listMeals(session.organizationId);

  return (
    <div className="min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/diet" />

      <main className="mx-auto max-w-4xl px-6 py-10 pb-28 sm:pb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Diet library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meals available to {session.organizationName} when building a plan.
        </p>

        {meals.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <Salad className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">
              The library is empty. Meals added here become the building blocks of every diet
              plan.
            </p>
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
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

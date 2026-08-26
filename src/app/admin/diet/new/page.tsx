import type { Metadata } from "next";
import Link from "next/link";

import { AppNav } from "@/components/nav/app-nav";
import { GlassPanel } from "@/components/glass/glass";
import { requireRole } from "@/server/auth/guards";

import { MealForm } from "../meal-form";

export const metadata: Metadata = { title: "Add a meal" };
export const dynamic = "force-dynamic";

/**
 * Add to the organisation's yoga library.
 *
 * Purely administrative: a meal describes nobody and carries no health data, so
 * `requireRole("ADMIN", "TRAINER")` is the entire authorization question and no assignment is involved.
 */
export default async function NewMealPage() {
  const session = await requireRole("ADMIN", "TRAINER");

  return (
    <div className="theme-bg-wrapper theme-orange-energy min-h-dvh bg-background">
      <AppNav role={session.role} currentPath="/admin/diet" />

      <main className="mx-auto max-w-2xl px-6 py-10 pb-28 sm:pb-10">
        <nav aria-label="Breadcrumb" className="type-meta text-muted-foreground">
          <Link href="/admin/diet" className="hover:text-foreground">
            Diet library
          </Link>
          <span aria-hidden> / </span>
          <span aria-current="page">Add a meal</span>
        </nav>

        <header className="mt-3">
          <h1 className="type-display text-foreground">Add a meal</h1>
          <p className="type-body mt-2 max-w-prose text-muted-foreground">
            Meals are the building blocks of a diet plan. Adding one here does not assign it
            to anybody.
          </p>
        </header>

        <GlassPanel className="mt-8 p-6">
          <MealForm />
        </GlassPanel>
      </main>
    </div>
  );
}

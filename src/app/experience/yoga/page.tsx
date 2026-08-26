import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { JOURNEY_SECTIONS } from "@/components/3d/yoga-pose";
import { branding } from "@/lib/branding";
import { listYogaExercises } from "@/server/repositories/library";
import { readTenantSession } from "@/server/auth/session";

import { JourneyScroller } from "./journey-scroller";

export const metadata: Metadata = {
  title: "The practice",
  description: branding.description,
};

export const dynamic = "force-dynamic";

/**
 * The immersive yoga journey (15B).
 *
 * THE ONLY ROUTE THAT LOADS 3D. ADR-014 keeps `three` out of every dashboard bundle, and
 * `/experience` is also the one path where `proxy.ts` widens the CSP — narrowly, for
 * WebAssembly compilation and a same-origin decoder worker. Both facts are why the
 * experience lives under its own prefix rather than being a section of the landing page.
 *
 * Poses come from the database. `JOURNEY_SECTIONS` fixes the ARC — assessment through to
 * rest, which is the product's opinion — while the organisation supplies the content. A
 * studio that adds a pose gets it here with no code change.
 *
 * Server component: it fetches, then hands plain data to the client scroller. No
 * repository call crosses into the browser.
 */
export default async function YogaExperiencePage() {
  const session = await readTenantSession();

  /*
   * Signed out, this is a marketing surface and there is no organisation to read from, so
   * the journey renders with its narrative and no poses. Signed in, it shows the
   * organisation's real library.
   *
   * Note what is NOT done: no fallback to another tenant's data, and no invented poses.
   * An empty journey is honest; a populated one built from nothing is not.
   */
  const poses = session
    ? (await listYogaExercises(session.organizationId)).slice(0, JOURNEY_SECTIONS.length)
    : [];

  return (
    <div className="theme-bg-wrapper theme-blue-calm min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border-glass bg-surface-glass backdrop-blur-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark */}
            <img src={branding.icons.mark} alt="" aria-hidden className="size-7 mix-blend-multiply" />
            <span className="font-semibold tracking-tight text-foreground">
              {branding.name}
            </span>
          </Link>

          <Button asChild size="sm" variant="outline">
            <Link href={session ? "/today" : "/sign-in"}>
              {session ? "Back to today" : "Sign in"}
            </Link>
          </Button>
        </div>
      </header>

      <JourneyScroller
        poses={poses.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          description: exercise.description,
          instructions: exercise.instructions,
          breathing: exercise.breathing,
          durationSeconds: exercise.defaultDurationSeconds,
          difficulty: exercise.difficulty,
          // Straight from the database. When 15C lands, a real model reference replaces
          // the placeholder here and no component changes (ADR-014).
          modelReference: null,
          animationReference: null,
        }))}
      />
    </div>
  );
}

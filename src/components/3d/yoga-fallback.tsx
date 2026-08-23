import { GlassPanel } from "@/components/glass/glass";
import { cn } from "@/lib/utils";

import type { YogaPose } from "./yoga-pose";

/**
 * What every viewer shows when 3D is unavailable — and what a screen reader always gets.
 *
 * THIS IS THE PRIMARY CONTENT, NOT A DEGRADED ONE.
 *
 * The instruction a consultant wrote must reach the person practising whether or not
 * their device can render WebGL. So this component carries everything the animation
 * conveys — name, Sanskrit name, duration, instructions, breathing — and the 3D scene is
 * an enhancement layered over it.
 *
 * It renders in four situations, and the wording adapts because they are genuinely
 * different problems for the reader:
 *
 *   - WebGL unavailable (older device, disabled, headless)
 *   - the model failed to load
 *   - reduced motion is on, so the journey is presented as text
 *   - the pose has no model at all, which is normal rather than an error
 */

export type FallbackReason = "no-webgl" | "load-failed" | "reduced-motion" | "no-model";

const REASON_TEXT: Record<FallbackReason, string | null> = {
  // Nothing is wrong and nothing is missing — saying so would invent a problem.
  "no-model": null,
  "reduced-motion": "Showing this as text because your device asks for reduced motion.",
  "no-webgl": "Your device cannot show the 3D guide. The full instructions are here.",
  "load-failed": "The 3D guide did not load. The full instructions are here.",
};

export function YogaFallback({
  pose,
  reason = "no-model",
  className,
}: {
  pose: YogaPose;
  reason?: FallbackReason;
  className?: string;
}) {
  const note = REASON_TEXT[reason];

  return (
    <GlassPanel className={cn("p-px", className)}>
      <div className="rounded-[calc(var(--radius-xl)-1px)] bg-surface/90 p-6">
        <h3 className="type-heading text-surface-foreground">
          {pose.name}
          {pose.sanskritName && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {pose.sanskritName}
            </span>
          )}
        </h3>

        {pose.durationSeconds && (
          <p className="type-meta mt-2 text-muted-foreground">
            {Math.round(pose.durationSeconds / 60)} min
          </p>
        )}

        {pose.instructions && (
          <p className="type-body mt-4 text-muted-foreground">{pose.instructions}</p>
        )}

        {pose.breathing && (
          <p className="type-body mt-3 text-muted-foreground">
            <span className="font-medium text-surface-foreground">Breathing: </span>
            {pose.breathing}
          </p>
        )}

        {/*
          The reason is secondary information and is placed last, quietly. Leading with
          "your device cannot show this" frames a working page as broken; the practice
          instructions are what the reader came for.
        */}
        {note && <p className="mt-5 text-xs text-muted-foreground">{note}</p>}
      </div>
    </GlassPanel>
  );
}

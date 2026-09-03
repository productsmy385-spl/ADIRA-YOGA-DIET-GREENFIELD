"use client";

import { useEffect, useRef, useState } from "react";
import { YogaIcon, BreathingIcon, MeditationIcon, WorkoutIcon } from "@/components/icons";
import { Reveal } from "@/components/motion/reveal";
import { WellnessBackground } from "@/components/ui/background-system";
import { YogaPoseScene } from "./yoga-pose-scene";

const POSE_STEPS = [
  {
    label: "Mountain Pose",
    sanskrit: "Tadasana",
    desc: "Ground your feet, lengthen the spine, and find your center of gravity.",
    Icon: YogaIcon,
    color: "emerald",
  },
  {
    label: "Warrior II",
    sanskrit: "Virabhadrasana II",
    desc: "Build strength and focus with a powerful standing pose.",
    Icon: WorkoutIcon,
    color: "amber",
  },
  {
    label: "Tree Pose",
    sanskrit: "Vrksasana",
    desc: "Cultivate balance and concentration on one leg.",
    Icon: BreathingIcon,
    color: "jade",
  },
  {
    label: "Child's Pose",
    sanskrit: "Balasana",
    desc: "Surrender to rest and release tension in the back and shoulders.",
    Icon: MeditationIcon,
    color: "sky",
  },
];

const COLOR_MAP: Record<string, { text: string; bg: string; border: string }> = {
  emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  amber: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  jade: { text: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30" },
  sky: { text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30" },
};

function useScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const sectionHeight = rect.height;
      const sectionTop = rect.top;
      const visible = windowHeight - sectionTop;
      const p = Math.max(0, Math.min(1, visible / (sectionHeight + windowHeight * 0.3)));
      setProgress(p);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { ref, progress };
}

export function YogaJourneySection() {
  const { ref, progress } = useScrollProgress();
  const activeStep = Math.min(
    POSE_STEPS.length - 1,
    Math.floor(progress * POSE_STEPS.length * 1.2),
  );

  return (
    <WellnessBackground
      id="yoga-journey"
      variant="botanical"
      isLanding={true}
      overlayOpacity="medium"
      className="py-24 border-b border-border-glass overflow-hidden"
    >
      <div ref={ref} className="mx-auto max-w-7xl px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            A Journey Through Movement
          </h2>
          <p className="mt-4 type-body text-muted-foreground text-lg">
            Scroll through four foundational asanas. Each pose builds on the last —
            from grounding to strength to balance to rest.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: 3D Figure */}
          <div className="relative">
            <Reveal distance={20}>
              <YogaPoseScene className="w-full" />
            </Reveal>

            {/* Active pose label overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="rounded-full border border-emerald-500/30 bg-surface-glass-strong px-5 py-2 backdrop-blur-glass shadow-lg">
                <div className="text-sm font-semibold text-foreground">
                  {POSE_STEPS[activeStep].label}
                </div>
                <div className="text-xs text-muted-foreground italic">
                  {POSE_STEPS[activeStep].sanskrit}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Scrollable pose steps */}
          <div className="space-y-6">
            {POSE_STEPS.map((step, idx) => {
              const colors = COLOR_MAP[step.color];
              const isActive = idx === activeStep;
              const IconComp = step.Icon;

              return (
                <Reveal key={idx} delay={idx * 80} distance={12}>
                  <div
                    className={`group relative flex gap-4 rounded-2xl border p-5 transition-all duration-[var(--duration-normal)] ease-[var(--ease-soft)] ${
                      isActive
                        ? `${colors.bg} ${colors.border} shadow-lg scale-[1.02]`
                        : "border-border-glass bg-surface-glass/40 hover:bg-surface-glass/70"
                    }`}
                  >
                    {/* Step number */}
                    <div
                      className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition-all duration-[var(--duration-fast)] ${
                        isActive
                          ? `${colors.bg} ${colors.text} scale-110`
                          : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <IconComp size={24} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className={`text-lg font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </h3>
                        <span className="text-xs italic text-muted-foreground">
                          {step.sanskrit}
                        </span>
                      </div>
                      <p className={`text-sm ${isActive ? "text-foreground/80" : "text-muted-foreground"}`}>
                        {step.desc}
                      </p>
                    </div>

                    {/* Active indicator bar */}
                    <div
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full transition-all duration-[var(--duration-normal)] ${
                        isActive ? `${colors.text.replace("text-", "bg-")} opacity-100` : "opacity-0"
                      }`}
                    />
                  </div>
                </Reveal>
              );
            })}

            {/* Progress indicator */}
            <div className="pt-4">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Scroll to explore</span>
                <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 transition-all duration-[var(--duration-normal)] ease-[var(--ease-soft)]"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <span className="tabular-nums">{Math.round(progress * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WellnessBackground>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BreathingIcon, MeditationIcon, WorkoutIcon, YogaIcon } from "@/components/icons";
import { Reveal } from "@/components/motion/reveal";
import { WellnessBackground } from "@/components/ui/background-system";

import { PoseFigure } from "./pose-figure";
import { type PoseKey } from "./pose-illustration";

/**
 * The four-asana journey.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WAS WRONG, SO IT DOES NOT COME BACK
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The pose cards were `<div>`s. Not misconfigured buttons, not buttons with a bad hit
 * area — there was no click handler anywhere in the file. The active pose was derived
 * from scroll position alone, so a card could not be chosen by a mouse, a keyboard, or
 * assistive technology.
 *
 * Worse, the figure beside them ran its OWN 4.5-second timer (`yoga-pose-showcase.tsx`)
 * and never saw the section's state. The caption said "Tree Pose" while the figure held
 * Warrior II, which is what "visually disconnected from the pose cards" actually meant.
 *
 * One piece of state now drives both, and the control is a real `<button>`, so the
 * keyboard and the screen reader get it for free rather than through a bolted-on
 * `onKeyDown`.
 *
 * Scroll still advances the pose — it is a nice piece of storytelling — but it YIELDS
 * PERMANENTLY the moment someone chooses for themselves. A scroll position that keeps
 * overriding a deliberate click is the same dead-control feeling in a new costume.
 */

interface PoseStep {
  key: PoseKey;
  label: string;
  sanskrit: string;
  /** How long the pose is held. Shown on the card and in the figure's caption chips. */
  duration: string;
  /** What the pose is FOR — "Foundation", "Balance". Not a difficulty rating. */
  badge: string;
  desc: string;
  Icon: typeof YogaIcon;
  /**
   * One hue per pose, carried by the icon tile AND by the selected card.
   *
   * The reference design does this deliberately: Mountain selects mint, Warrior II selects
   * violet. Selecting a pose saturates the colour that pose already owned, so the hue
   * answers "which pose" and the saturation answers "is it chosen" — one colour language
   * doing two jobs rather than two competing.
   */
  tone: {
    tile: string;
    activeCard: string;
    dot: string;
    ring: string;
  };
}

const POSE_STEPS: readonly PoseStep[] = [
  {
    key: "mountain",
    label: "Mountain Pose",
    sanskrit: "Tadasana",
    duration: "1 min",
    badge: "Foundation",
    desc: "Posture, grounding and steady breath before the sequence begins.",
    Icon: YogaIcon,
    tone: {
      tile: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
      activeCard: "border-emerald-500/50 bg-emerald-500/10",
      dot: "border-emerald-500 bg-emerald-500",
      ring: "focus-visible:ring-emerald-500/60",
    },
  },
  {
    /*
     * Warrior II, deliberately — not Warrior I. Contract §11 records the decision and
     * `CONTRACT_CLIPS` carries the matching `warrior-2-left` / `warrior-2-right`. When a
     * real character lands, this pose plays `warrior-2-left`; `key` here is the
     * illustration's own identifier and is not an animation name.
     */
    key: "warrior",
    label: "Warrior II",
    sanskrit: "Virabhadrasana II",
    duration: "2 min",
    badge: "Intermediate",
    desc: "Hip opening, leg strength and calm, focused attention.",
    Icon: WorkoutIcon,
    tone: {
      tile: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
      activeCard: "border-violet-500/50 bg-violet-500/10",
      dot: "border-violet-500 bg-violet-500",
      ring: "focus-visible:ring-violet-500/60",
    },
  },
  {
    key: "tree",
    label: "Tree Pose",
    sanskrit: "Vrikshasana",
    duration: "90 sec",
    badge: "Balance",
    desc: "Single-leg balance, building concentration and ankle stability.",
    Icon: BreathingIcon,
    tone: {
      tile: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
      activeCard: "border-sky-500/50 bg-sky-500/10",
      dot: "border-sky-500 bg-sky-500",
      ring: "focus-visible:ring-sky-500/60",
    },
  },
  {
    key: "child",
    label: "Child's Pose",
    sanskrit: "Balasana",
    duration: "3 min",
    badge: "Restorative",
    desc: "Releasing the lower back and shoulders, and letting the breath settle.",
    Icon: MeditationIcon,
    tone: {
      tile: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
      activeCard: "border-indigo-500/50 bg-indigo-500/10",
      dot: "border-indigo-500 bg-indigo-500",
      ring: "focus-visible:ring-indigo-500/60",
    },
  },
];

/**
 * Scroll position → step index, throttled to one read per frame.
 *
 * The previous version called `getBoundingClientRect()` directly inside a `scroll`
 * handler. That forces a synchronous layout on every event, and the browser fires them
 * far faster than it paints — measurable jank on a mid-range phone, and a plausible
 * share of "scrolling feels slow". Coalescing into `requestAnimationFrame` means at most
 * one measurement per painted frame, which is the most that can possibly be useful.
 *
 * `enabled` is false once the reader takes control, and the listener is then removed
 * rather than left running behind an early return.
 */
function useScrollStep(stepCount: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const seen = window.innerHeight - rect.top;
      const p = Math.max(0, Math.min(1, seen / (rect.height + window.innerHeight * 0.3)));
      /*
       * Only the STEP is stored, not the raw fraction. The progress bar reports position
       * in the sequence rather than scroll depth, so keeping `p` in state would re-render
       * the whole section on every frame of every scroll to drive nothing.
       */
      setStep(Math.min(stepCount - 1, Math.floor(p * stepCount * 1.2)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [stepCount, enabled]);

  return { ref, step };
}

export function YogaJourneySection() {
  /* null = nobody has chosen yet, so scroll is still driving. */
  const [chosen, setChosen] = useState<number | null>(null);
  const { ref, step: scrolledStep } = useScrollStep(POSE_STEPS.length, chosen === null);

  const activeStep = chosen ?? scrolledStep;
  const active = POSE_STEPS[activeStep];

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Arrow keys move between poses, which is what a reader who has just tabbed onto one
   * will try. Home/End jump to the ends. Focus follows selection so the highlight and
   * the focus ring never disagree about which pose is current.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const last = POSE_STEPS.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;

    if (next === null) return;
    event.preventDefault();
    setChosen(next);
    tabRefs.current[next]?.focus();
  }, []);

  return (
    <WellnessBackground
      id="yoga-journey"
      variant="botanical"
      isLanding
      overlayOpacity="medium"
      className="border-b border-border-glass py-20 sm:py-24"
    >
      <div ref={ref} className="mx-auto max-w-7xl px-5 sm:px-6">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <YogaIcon size={14} />
            Yoga Journey
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Move through the sequence
          </h2>
          <p className="type-body mt-4 text-lg text-muted-foreground">
            Select a pose to see the practice, its focus and how long to hold it.
          </p>
        </Reveal>

        {/*
          Figure above the list on mobile, beside it from `lg` up. `items-start` rather
          than `items-center` so the figure column cannot stretch and push the buttons
          off-screen when the descriptions wrap to different heights.
        */}
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
          {/* ── The figure ── */}
          <div className="lg:sticky lg:top-24">
            <Reveal distance={20}>
              <div className="mx-auto w-full max-w-105">
                {/*
                  A square panel with the figure scaling inside it. This is the whole fix
                  for "cropped / oversized / partially outside the viewport": both the SVG
                  and the photograph letterbox into the box they are given and cannot
                  overflow it, so there is no width at which the figure loses its feet.
                */}
                <PoseFigure pose={active.key} label={active.label} />

                {/*
                  Caption chips. Driven by the SAME state as the figure, so the name beside
                  a pose can no longer disagree with the pose being shown — which is exactly
                  what happened when the figure ran its own timer.
                */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {active.label}
                  </span>
                  <span className="rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                    {active.sanskrit}
                  </span>
                  <span className="rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                    {active.duration}
                  </span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* ── The selector ── */}
          <div
            className="space-y-4"
            role="group"
            aria-label="Choose a yoga pose"
          >
            {POSE_STEPS.map((pose, index) => {
              const isActive = index === activeStep;
              const { Icon } = pose;

              return (
                <Reveal key={pose.key} delay={index * 70} distance={12}>
                  <button
                    type="button"
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    onClick={() => setChosen(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    aria-pressed={isActive}
                    /*
                      The BUTTON is the card. Previously the only tinted region was a 48px
                      icon tile, which is the "tiny icon is the only target" problem even
                      once a handler exists. `w-full` and `text-left` make the whole surface
                      the control while it still reads as a card.
                    */
                    className={`group w-full rounded-2xl border p-4 text-left transition-all duration-(--duration-normal) ease-(--ease-out-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${pose.tone.ring} ${
                      isActive
                        ? `${pose.tone.activeCard} shadow-md`
                        : "border-border-glass bg-surface-glass/50 hover:-translate-y-0.5 hover:bg-surface-glass hover:shadow-md motion-reduce:hover:translate-y-0"
                    }`}
                  >
                    <span className="flex items-center gap-4">
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-(--duration-fast) ${pose.tone.tile} ${
                          isActive ? "scale-105" : "group-hover:scale-105"
                        }`}
                      >
                        <Icon size={22} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-foreground">
                            {pose.label}
                          </span>
                          <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {pose.badge}
                          </span>
                        </span>

                        {/*
                          Sanskrit stays in its OWN element rather than being interpolated
                          into one string. It is how the figure caption and this card are
                          checked against each other in the tests, and a single text node
                          would make that assertion impossible to write precisely.
                        */}
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          <span className="italic">{pose.sanskrit}</span>
                          {" · "}
                          <span>{pose.duration}</span>
                        </span>

                        {/* The description is the reward for selecting — it appears only
                            on the chosen pose, as in the reference design. */}
                        {isActive ? (
                          <span className="mt-1.5 block text-sm text-foreground/80">
                            {pose.desc}
                          </span>
                        ) : null}
                      </span>

                      {/*
                        Selection dot. Decorative only: `aria-pressed` on the button is what
                        actually conveys state, so this is hidden from assistive technology
                        rather than announced a second time in a different vocabulary.
                      */}
                      <span
                        aria-hidden
                        className={`size-3.5 shrink-0 rounded-full border-2 transition-colors duration-(--duration-fast) ${
                          isActive ? pose.tone.dot : "border-border bg-transparent"
                        }`}
                      />
                    </span>
                  </button>
                </Reveal>
              );
            })}

            {/*
              Progress through the sequence, not through the scroll.

              Once a pose is chosen this tracks the SELECTION — a bar still creeping with
              the scroll position beside a pinned pose reads as broken, because the reader
              has just been told their choice is what matters.
            */}
            <div className="pt-2">
              <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>
                  Pose {activeStep + 1} of {POSE_STEPS.length}
                </span>
                <span className="tabular-nums">
                  {Math.round(((activeStep + 1) / POSE_STEPS.length) * 100)}% of sequence
                </span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted/40">
                <span
                  className="block h-full rounded-full bg-linear-to-r from-emerald-500 via-teal-500 to-sky-500 transition-all duration-(--duration-normal) ease-(--ease-out-soft)"
                  style={{
                    width: `${((activeStep + 1) / POSE_STEPS.length) * 100}%`,
                  }}
                />
              </span>
            </div>
          </div>
        </div>
      </div>
    </WellnessBackground>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { WellnessBackground } from "@/components/ui/background-system";
import {
  YogaIcon,
  MeditationIcon,
  BreathingIcon,
  SleepIcon,
  WaterIcon,
  DietIcon,
  MealIcon,
  NutritionIcon,
  WorkoutIcon,
  ProgressIcon,
  CheckInIcon,
  CoachIcon,
} from "@/components/icons";
import { branding } from "@/lib/branding";
import { Hero3DScene } from "./hero-3d-scene";
import { Diet3DScene } from "./diet-3d-scene";

interface LandingNavProps {
  destination: string;
  ctaText: string;
}

/**
 * 1. Clean Desktop Navigation Bar (No outer container card wrapper)
 */
export function LandingHeader({ destination, ctaText }: LandingNavProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.icons.mark}
            alt=""
            aria-hidden
            className="size-8 shrink-0 mix-blend-multiply dark:mix-blend-screen"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">
            {branding.name}
          </span>
        </Link>

        {/* Center Navigation Links */}
        <nav aria-label="Landing Navigation" className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link href="#hero" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <Link href="#yoga" className="transition-colors hover:text-foreground">
            Yoga
          </Link>
          <Link href="#diet" className="transition-colors hover:text-foreground">
            Diet
          </Link>
          <Link href="#wellness" className="transition-colors hover:text-foreground">
            Daily Habits
          </Link>
          <Link href="#progress" className="transition-colors hover:text-foreground">
            Progress
          </Link>
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild size="sm" className="rounded-full px-5 shadow-xs">
            <Link href={destination}>{ctaText}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * 2. Hero Section — Integrated Botanical Background (botanical-green.webp)
 */
export function HeroSection({ destination }: { destination: string; ctaText?: string }) {
  return (
    <WellnessBackground
      id="hero"
      variant="botanical"
      overlayOpacity="light"
      className="min-h-[calc(100vh-73px)] flex items-center py-16 lg:py-0"
    >
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center w-full">
        {/* Left Headline & Content */}
        <div className="lg:col-span-6 space-y-6">
          <h1 className="type-display text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground text-balance">
            Wellness, <br />
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
              in Balance.
            </span>
          </h1>

          <p className="type-body text-base sm:text-lg text-muted-foreground max-w-lg">
            Personalized yoga, nutrition and daily wellness guidance designed around you.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="rounded-full px-8 shadow-md">
              <Link href={destination}>
                Start Your Journey
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>

            <Button asChild size="lg" variant="outline" className="rounded-full px-8 backdrop-blur-xs">
              <Link href="#yoga">
                Explore Wellness
              </Link>
            </Button>
          </div>
        </div>

        {/* Right 3D Visual Subject */}
        <div className="lg:col-span-6 flex justify-center">
          <Hero3DScene className="w-full max-w-md" />
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 3. Trust Stats Bar
 */
export function StatsSection() {
  return (
    <section className="border-y border-border/40 bg-muted/30 backdrop-blur-xs py-10">
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
        <div>
          <div className="text-3xl font-extrabold tracking-tight text-primary">
            <AnimatedNumber value={500} suffix="+" />
          </div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Active Members</div>
        </div>

        <div>
          <div className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
            <AnimatedNumber value={30} suffix="+" />
          </div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Yoga Programmes</div>
        </div>

        <div>
          <div className="text-3xl font-extrabold tracking-tight text-amber-600 dark:text-amber-400">
            <AnimatedNumber value={100} suffix="+" />
          </div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Healthy Recipes</div>
        </div>

        <div>
          <div className="text-3xl font-extrabold tracking-tight text-sky-600 dark:text-sky-400">
            <AnimatedNumber value={98} suffix="%" />
          </div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">Satisfaction Rate</div>
        </div>
      </div>
    </section>
  );
}

/**
 * 4. Yoga Section — Integrated Botanical Green Environment (botanical-green.webp)
 */
export function YogaSection() {
  const [activePractice, setActivePractice] = useState("Asana Flow");

  return (
    <WellnessBackground
      id="yoga"
      variant="botanical"
      overlayOpacity="medium"
      className="py-24 border-b border-border/40"
    >
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Visual Composition with Floating Labels */}
        <div className="lg:col-span-6 relative flex items-center justify-center">
          <div className="relative z-10 size-72 sm:size-80 rounded-full border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center backdrop-blur-xs">
            <YogaIcon size={120} className="text-emerald-600 dark:text-emerald-400 animate-breathe" />
          </div>

          {/* Floating Practice Labels */}
          <button
            onClick={() => setActivePractice("Asana Flow")}
            className={`absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-md transition-all ${
              activePractice === "Asana Flow"
                ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                : "border-border bg-background/90 text-foreground"
            }`}
          >
            <YogaIcon size={16} /> Yoga Asanas
          </button>

          <button
            onClick={() => setActivePractice("Pranayama")}
            className={`absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-md transition-all ${
              activePractice === "Pranayama"
                ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                : "border-border bg-background/90 text-foreground"
            }`}
          >
            <BreathingIcon size={16} /> Pranayama
          </button>

          <button
            onClick={() => setActivePractice("Meditation")}
            className={`absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-md transition-all ${
              activePractice === "Meditation"
                ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                : "border-border bg-background/90 text-foreground"
            }`}
          >
            <MeditationIcon size={16} /> Stillness
          </button>

          <button
            onClick={() => setActivePractice("Flexibility")}
            className={`absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-md transition-all ${
              activePractice === "Flexibility"
                ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                : "border-border bg-background/90 text-foreground"
            }`}
          >
            <WorkoutIcon size={16} /> Flexibility
          </button>
        </div>

        {/* Right Storytelling Content */}
        <div className="lg:col-span-6 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Move with Intention
          </h2>

          <p className="type-body text-muted-foreground">
            Guided yoga, meditation, breathing and daily movement structured specifically around your body and schedule.
          </p>

          <div className="pt-2 space-y-4">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                <Check size={14} />
              </div>
              <span>Guided 3D pose alignment indicators</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-foreground">
              <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                <Check size={14} />
              </div>
              <span>Rhythmic breath pacing for nervous system tone</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-foreground">
              <div className="size-5 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                <Check size={14} />
              </div>
              <span>Prescribed directly by certified yoga practitioners</span>
            </div>
          </div>
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 5. Diet Section — Integrated Nutrition Orange Environment (nutrition-orange.webp)
 */
export function DietSection() {
  return (
    <WellnessBackground
      id="diet"
      variant="nutrition"
      overlayOpacity="medium"
      className="py-24 border-b border-border/40"
    >
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Storytelling Text */}
        <div className="lg:col-span-6 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Nourish Your Balance
          </h2>

          <p className="type-body text-muted-foreground">
            Personalized nutrition plans built around your routine. Wholesome recipes and nutrient tracking aligned with your daily practice.
          </p>

          {/* Minimal 4-Indicator Strip */}
          <div className="pt-4 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <MealIcon size={24} className="text-amber-600" />
              <div>
                <div className="text-sm font-semibold text-foreground">Healthy Meals</div>
                <div className="text-xs text-muted-foreground">Custom recipes</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <NutritionIcon size={24} className="text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-foreground">Nutrient Balance</div>
                <div className="text-xs text-muted-foreground">Optimal macros</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <WaterIcon size={24} className="text-sky-600" />
              <div>
                <div className="text-sm font-semibold text-foreground">Pure Hydration</div>
                <div className="text-xs text-muted-foreground">2.5L daily target</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DietIcon size={24} className="text-amber-600" />
              <div>
                <div className="text-sm font-semibold text-foreground">Daily Energy</div>
                <div className="text-xs text-muted-foreground">Sustained vitality</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 3D Diet Visual Subject */}
        <div className="lg:col-span-6 flex justify-center">
          <Diet3DScene className="w-full max-w-md" />
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 6. Daily Wellness Section — Integrated Wellness Pink Environment (wellness-pink.webp)
 */
export function DailyWellnessSection() {
  return (
    <WellnessBackground
      id="wellness"
      variant="wellness"
      overlayOpacity="medium"
      className="py-24 border-b border-border/40"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Small Habits. Meaningful Progress.
          </h2>
          <p className="mt-3 type-body text-muted-foreground">
            Monitor water, sleep, mood, and daily movement in one clear visual composition.
          </p>
        </div>

        {/* Single Cohesive Composition Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="space-y-3 p-4 rounded-2xl bg-background/70 backdrop-blur-sm border border-border/30">
            <WaterIcon size={36} className="mx-auto text-sky-600" />
            <h3 className="text-sm font-semibold text-foreground">Water</h3>
            <p className="text-xs text-muted-foreground">2,400 / 2,500 ml</p>
          </div>

          <div className="space-y-3 p-4 rounded-2xl bg-background/70 backdrop-blur-sm border border-border/30">
            <SleepIcon size={36} className="mx-auto text-indigo-600" />
            <h3 className="text-sm font-semibold text-foreground">Sleep</h3>
            <p className="text-xs text-muted-foreground">7h 45m Restful</p>
          </div>

          <div className="space-y-3 p-4 rounded-2xl bg-background/70 backdrop-blur-sm border border-border/30">
            <WorkoutIcon size={36} className="mx-auto text-emerald-600" />
            <h3 className="text-sm font-semibold text-foreground">Steps</h3>
            <p className="text-xs text-muted-foreground">8,420 / 10,000</p>
          </div>

          <div className="space-y-3 p-4 rounded-2xl bg-background/70 backdrop-blur-sm border border-border/30">
            <CheckInIcon size={36} className="mx-auto text-teal-600" />
            <h3 className="text-sm font-semibold text-foreground">Mood</h3>
            <p className="text-xs text-muted-foreground">Calm &amp; Focused</p>
          </div>
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 7. Personalization Section — Integrated Lime Green Meadow Environment (lime-green.webp)
 */
export function PersonalizationSection() {
  const steps = [
    { title: "You", desc: "Goal assessment", Icon: CoachIcon },
    { title: "Personalized Yoga", desc: "Custom routines", Icon: YogaIcon },
    { title: "Personalized Diet", desc: "Tailored nutrition", Icon: DietIcon },
    { title: "Daily Activities", desc: "Habit tracking", Icon: CheckInIcon },
    { title: "Progress", desc: "Verified health metrics", Icon: ProgressIcon },
  ];

  return (
    <WellnessBackground
      variant="lime"
      overlayOpacity="medium"
      className="py-24 border-b border-border/40"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Your Wellness. Your Rhythm.
          </h2>
          <p className="mt-3 type-body text-muted-foreground">
            An organic path designed around your body, guided by expert practitioners.
          </p>
        </div>

        {/* Organic Flowing Path */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {steps.map((step, idx) => {
            const IconComp = step.Icon;
            return (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center text-center space-y-2 max-w-[140px]">
                  <div className="size-12 rounded-full border border-primary/30 bg-background/90 text-primary flex items-center justify-center shadow-xs backdrop-blur-xs">
                    <IconComp size={22} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>

                {idx < steps.length - 1 && (
                  <div className="hidden sm:block text-muted-foreground/60">
                    <ArrowRight size={20} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 8. Progress Section — Integrated Ocean Blue Environment (ocean-blue.webp)
 */
export function ProgressSection() {
  return (
    <WellnessBackground
      id="progress"
      variant="ocean"
      overlayOpacity="medium"
      className="py-24 border-b border-border/40"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Progress You Can Feel
          </h2>
          <p className="mt-3 type-body text-muted-foreground">
            Adherence metrics and progress reports recorded honestly.
          </p>
        </div>

        {/* Central Progress Circle Composition */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="relative size-44 flex items-center justify-center bg-background/80 rounded-full p-4 border border-sky-500/20 backdrop-blur-md shadow-lg">
            <svg className="size-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-muted/30 stroke-current" strokeWidth="2.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path className="text-emerald-500 stroke-current" strokeWidth="2.5" strokeDasharray="88, 100" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <div className="absolute">
              <div className="text-4xl font-extrabold text-foreground">
                <AnimatedNumber value={88} suffix="%" />
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">Wellness Score</div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-8 text-xs font-medium text-muted-foreground">
            <div>Yoga: <span className="font-semibold text-emerald-600">6/7 days</span></div>
            <div>Diet: <span className="font-semibold text-amber-600">5/7 days</span></div>
            <div>Check-ins: <span className="font-semibold text-sky-600">6/7 days</span></div>
          </div>
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 9. CTA Section — Integrated Meditation Twilight Environment (meditation-purple.webp)
 */
export function LandingCTA({ destination, ctaText }: { destination: string; ctaText: string }) {
  return (
    <WellnessBackground
      variant="meditation"
      overlayOpacity="medium"
      className="py-20 text-center border-b border-border/40"
    >
      <div className="mx-auto max-w-3xl px-6 space-y-6">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Ready to Find Your Balance?
        </h2>

        <p className="type-body text-muted-foreground">
          Personalized yoga therapy, nutrition plans, and daily habit tracking designed around your life.
        </p>

        <div className="pt-2 flex justify-center gap-4">
          <Button asChild size="lg" className="rounded-full px-8 shadow-md">
            <Link href={destination}>
              {ctaText}
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </WellnessBackground>
  );
}

/**
 * 10. Simple Footer (1 Row, No Card Wrapping)
 */
export function LandingFooter() {
  return (
    <footer className="py-8 bg-background">
      <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.icons.mark} alt="" aria-hidden className="size-5 mix-blend-multiply dark:mix-blend-screen" />
          <span className="font-semibold text-foreground">{branding.name}</span>
        </div>

        <div>{branding.tagline}</div>

        <div>© {new Date().getFullYear()} {branding.name}. All rights reserved.</div>
      </div>
    </footer>
  );
}

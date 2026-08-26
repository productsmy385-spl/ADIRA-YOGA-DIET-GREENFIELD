"use client";

import React from "react";
import {
  YogaIcon,
  MeditationIcon,
  BreathingIcon,
  SleepIcon,
  WaterIcon,
  DietIcon,
  MealsIcon,
  NutritionIcon,
  WorkoutIcon,
  ProgressIcon,
  CheckinIcon,
  ReportsIcon,
  CalendarIcon,
  CoachIcon,
  SettingsIcon,
} from "@/components/ui/wellness-icons";
import { GlassCard } from "@/components/glass/glass";

const ICONS = [
  { name: "Yoga", Icon: YogaIcon },
  { name: "Meditation", Icon: MeditationIcon },
  { name: "Breathing", Icon: BreathingIcon },
  { name: "Sleep", Icon: SleepIcon },
  { name: "Water", Icon: WaterIcon },
  { name: "Diet", Icon: DietIcon },
  { name: "Meals", Icon: MealsIcon },
  { name: "Nutrition", Icon: NutritionIcon },
  { name: "Workout", Icon: WorkoutIcon },
  { name: "Progress", Icon: ProgressIcon },
  { name: "Check-in", Icon: CheckinIcon },
  { name: "Reports", Icon: ReportsIcon },
  { name: "Calendar", Icon: CalendarIcon },
  { name: "Coach", Icon: CoachIcon },
  { name: "Settings", Icon: SettingsIcon },
];

export function WellnessIconSystemShowcase() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-5">
      {ICONS.map(({ name, Icon }) => (
        <div
          key={name}
          className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-card/60 p-4 transition-all duration-300 hover:border-primary/50 hover:bg-card hover:shadow-md"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={22} />
          </div>
          <span className="mt-2.5 text-xs font-medium text-foreground">{name}</span>
        </div>
      ))}
    </div>
  );
}

export function InteractiveMobileAppPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-5 shadow-2xl backdrop-blur-md">
      {/* Status bar mock */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <span>100%</span>
        </div>
      </div>

      {/* Today's Practice Header */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Today&apos;s Plan</p>
          <h4 className="text-base font-semibold text-foreground">Morning Wellness</h4>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
          85% Done
        </span>
      </div>

      {/* Activity Card 1 */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <YogaIcon size={18} />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Hatha Yoga Flow</p>
            <p className="text-[10px] text-muted-foreground">30 min · Morning Session</p>
          </div>
        </div>
        <span className="size-5 rounded-full bg-primary text-center text-[10px] font-bold text-primary-foreground leading-5">
          ✓
        </span>
      </div>

      {/* Activity Card 2 */}
      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <DietIcon size={18} />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Healthy Breakfast</p>
            <p className="text-[10px] text-muted-foreground">Oats &amp; Fresh Berries</p>
          </div>
        </div>
        <span className="size-5 rounded-full bg-primary text-center text-[10px] font-bold text-primary-foreground leading-5">
          ✓
        </span>
      </div>

      {/* Water Tracking */}
      <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <WaterIcon size={18} />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Drink Water</p>
            <p className="text-[10px] text-muted-foreground">2.0 / 3.0 Liters</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-primary">66%</span>
      </div>

      {/* Mock Bottom Navigation */}
      <div className="mt-6 flex items-center justify-around border-t border-border/60 pt-3">
        <div className="flex flex-col items-center text-primary">
          <YogaIcon size={18} />
          <span className="mt-1 text-[9px] font-medium">Today</span>
        </div>
        <div className="flex flex-col items-center text-muted-foreground">
          <ProgressIcon size={18} />
          <span className="mt-1 text-[9px]">Progress</span>
        </div>
        <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <span className="text-sm font-bold">+</span>
        </div>
        <div className="flex flex-col items-center text-muted-foreground">
          <ReportsIcon size={18} />
          <span className="mt-1 text-[9px]">Reports</span>
        </div>
        <div className="flex flex-col items-center text-muted-foreground">
          <CoachIcon size={18} />
          <span className="mt-1 text-[9px]">Profile</span>
        </div>
      </div>
    </div>
  );
}

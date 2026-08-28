import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

/** Meditation Icon (Green/Teal Mindfulness Aura Theme) */
export function MeditationIcon({ size = 24, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 text-teal-600 dark:text-teal-400", className)}
      aria-label="Meditation"
      {...props}
    >
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8v5" />
      <path d="M8 18c1.5-2 4-2.5 4-2.5s2.5.5 4 2.5" />
      <path d="M5 11.5a8 8 0 0 1 14 0" strokeDasharray="3 3" />
      <path d="M2.5 8.5a11 11 0 0 1 19 0" strokeOpacity="0.5" />
    </svg>
  );
}

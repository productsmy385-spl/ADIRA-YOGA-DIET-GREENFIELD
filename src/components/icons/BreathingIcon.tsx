import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

/** Breathing Icon (Blue Breath Waves Theme) */
export function BreathingIcon({ size = 24, className, ...props }: IconProps) {
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
      className={cn("shrink-0 text-sky-600 dark:text-sky-400", className)}
      aria-label="Pranayama Breathing"
      {...props}
    >
      <path d="M3 8c3-3 6 3 9 0s6-3 9 0" />
      <path d="M3 12c3-3 6 3 9 0s6-3 9 0" />
      <path d="M3 16c3-3 6 3 9 0s6-3 9 0" />
      <circle cx="19" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

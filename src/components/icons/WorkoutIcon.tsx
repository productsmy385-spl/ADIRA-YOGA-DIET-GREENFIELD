import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

export function WorkoutIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Active Workout"
      {...props}
    >
      <circle cx="12" cy="4" r="2" />
      <path d="M7 10l5-2 5 2" />
      <path d="M12 8v6" />
      <path d="M9 20l3-6 3 6" />
    </svg>
  );
}

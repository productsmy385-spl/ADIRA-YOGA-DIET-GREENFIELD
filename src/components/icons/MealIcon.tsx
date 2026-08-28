import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

export function MealIcon({ size = 24, className, ...props }: IconProps) {
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
      className={cn("shrink-0 text-amber-600 dark:text-amber-400", className)}
      aria-label="Healthy Meal"
      {...props}
    >
      <path d="M4 11h16a8 8 0 0 1-16 0z" />
      <path d="M4 11V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
      <path d="M9 19h6" />
      <path d="M8 4c.5-1 1.5-1 2 0" />
      <path d="M12 4c.5-1 1.5-1 2 0" />
      <path d="M16 4c.5-1 1.5-1 2 0" />
    </svg>
  );
}

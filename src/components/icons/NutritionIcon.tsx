import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

export function NutritionIcon({ size = 24, className, ...props }: IconProps) {
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
      className={cn("shrink-0 text-emerald-600 dark:text-emerald-400", className)}
      aria-label="Nutrient Balance"
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16" />
      <path d="M4 12h16" />
      <path d="M16 8l-8 8" />
    </svg>
  );
}

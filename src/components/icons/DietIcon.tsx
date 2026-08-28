import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

/** Diet Icon (Orange Saffron Nutrition Theme) */
export function DietIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Diet & Nutrition"
      {...props}
    >
      <path d="M11 20A9 9 0 0 0 20 11V4h-7a9 9 0 0 0-9 9c0 2.5 1 4.8 2.6 6.4" />
      <path d="M11 20v-9a9 9 0 0 1 9-9" />
    </svg>
  );
}

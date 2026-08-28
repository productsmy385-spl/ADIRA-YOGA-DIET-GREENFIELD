import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

export function ProgressIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Progress Metrics"
      {...props}
    >
      <path d="M3 18l6-6 4 4 8-8" />
      <path d="M17 8h4v4" />
      <circle cx="21" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

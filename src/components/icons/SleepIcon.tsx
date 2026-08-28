import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

/** Sleep Icon (Purple Restful Night Theme) */
export function SleepIcon({ size = 24, className, ...props }: IconProps) {
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
      className={cn("shrink-0 text-indigo-600 dark:text-indigo-400", className)}
      aria-label="Sleep Quality"
      {...props}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      <path d="M17 4v2" />
      <path d="M16 5h2" />
    </svg>
  );
}

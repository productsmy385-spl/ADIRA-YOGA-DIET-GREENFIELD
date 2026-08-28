import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

export function CheckInIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Daily Check-In"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 5-5" />
    </svg>
  );
}

import React from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./YogaIcon";

/** Water Hydration Icon (Blue Ocean Theme) */
export function WaterIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Water Hydration"
      {...props}
    >
      <path d="M12 2.75C12 2.75 5 10 5 15a7 7 0 0 0 14 0c0-5-7-12.25-7-12.25z" />
      <path d="M10 14a3 3 0 0 0 3 3" opacity="0.6" />
    </svg>
  );
}

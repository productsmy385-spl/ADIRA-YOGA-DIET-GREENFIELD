import React from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

/** Yoga Asana Icon (Green Botanical Theme) */
export function YogaIcon({ size = 24, className, ...props }: IconProps) {
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
      aria-label="Yoga Asana"
      {...props}
    >
      <circle cx="12" cy="5" r="2.25" />
      <path d="M12 7.25v6" />
      <path d="M7 10.5c1.5-1.5 3.5-1.5 5 0 1.5-1.5 3.5-1.5 5 0" />
      <path d="M4 17.5c2-2.5 5-2.5 8 0 3-2.5 6-2.5 8 0" />
      <path d="M5 19.5h14" />
    </svg>
  );
}

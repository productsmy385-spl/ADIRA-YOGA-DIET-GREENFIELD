import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BackgroundVariant =
  | "yoga"
  | "diet"
  | "progress"
  | "notifications"
  | "profile"
  | "admin"
  | "access-requests"
  | "programmes"
  | "members"
  | "team";

interface WellnessBackgroundProps {
  variant: BackgroundVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<BackgroundVariant, string> = {
  yoga: "theme-green-nature",
  diet: "theme-orange-energy",
  progress: "theme-blue-calm",
  notifications: "theme-purple-serenity",
  profile: "theme-purple-serenity",
  admin: "theme-green-nature",
  "access-requests": "theme-fresh-green",
  programmes: "theme-green-nature",
  members: "theme-blue-calm",
  team: "theme-fresh-green",
};

/**
 * Atmospheric Botanical Background Layer System.
 * Supplies consistent, subtle wellness gradients and decorative elements
 * while preserving 100% text readability.
 */
export function WellnessBackground({
  variant,
  children,
  className = "",
}: WellnessBackgroundProps) {
  const themeClass = VARIANT_CLASS[variant] ?? "theme-green-nature";

  return (
    <div
      className={cn(
        "theme-bg-wrapper min-h-dvh bg-background sm:pl-[260px] pt-14 sm:pt-0 transition-colors duration-300",
        themeClass,
        className
      )}
    >
      {children}
    </div>
  );
}

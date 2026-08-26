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

const ACCENT_CLASS: Record<BackgroundVariant, string> = {
  yoga: "border-t-2 border-t-emerald-500/30",
  diet: "border-t-2 border-t-amber-500/30",
  progress: "border-t-2 border-t-sky-500/30",
  notifications: "border-t-2 border-t-purple-500/30",
  profile: "border-t-2 border-t-teal-500/30",
  admin: "border-t-2 border-t-emerald-600/30",
  "access-requests": "border-t-2 border-t-teal-600/30",
  programmes: "border-t-2 border-t-emerald-500/30",
  members: "border-t-2 border-t-sky-600/30",
  team: "border-t-2 border-t-teal-500/30",
};

/**
 * Global Calm Wellness Background System (<WellnessAppBackground />).
 * Provides a minimal, warm ivory / light sage canvas (#F7F8F2) in light mode
 * and deep botanical charcoal (#101914) in dark mode for all authenticated pages.
 */
export function WellnessBackground({
  variant,
  children,
  className = "",
}: WellnessBackgroundProps) {
  const accentBorder = ACCENT_CLASS[variant] ?? "border-t-2 border-t-emerald-500/30";

  return (
    <div
      className={cn(
        "theme-bg-wrapper min-h-dvh bg-background sm:pl-[260px] pt-14 sm:pt-0 transition-colors duration-300 relative z-0",
        accentBorder,
        className
      )}
    >
      {children}
    </div>
  );
}

export { WellnessBackground as WellnessAppBackground };

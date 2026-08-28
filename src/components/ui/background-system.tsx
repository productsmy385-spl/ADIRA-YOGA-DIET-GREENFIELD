"use client";

import React, { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export type WellnessBackgroundVariant =
  | "botanical"
  | "nutrition"
  | "wellness"
  | "ocean"
  | "lime"
  | "meditation";

interface WellnessBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: WellnessBackgroundVariant;
  /** Controls readability overlay opacity over background image on landing pages */
  overlayOpacity?: "light" | "medium" | "strong" | "none";
  /** Flag indicating whether this section is part of the public landing page. Default is false (clean app canvas) */
  isLanding?: boolean;
  children?: React.ReactNode;
  className?: string;
  glowPosition?: "top" | "center" | "bottom" | "none";
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => (typeof window !== "undefined" ? window.matchMedia(REDUCED_MOTION).matches : false),
    () => true
  );
}

const LANDING_BACKGROUND_MAP: Record<WellnessBackgroundVariant, string> = {
  botanical: "/backgrounds/platform-bg.png",
  nutrition: "/backgrounds/nutrition-orange.webp",
  wellness: "/backgrounds/wellness-pink.webp",
  ocean: "/backgrounds/ocean-blue.webp",
  lime: "/backgrounds/platform-bg.png",
  meditation: "/backgrounds/meditation-purple.webp",
};

const APP_ATMOSPHERE_GLOW: Record<WellnessBackgroundVariant, string> = {
  botanical: "after:bg-emerald-500/5",
  nutrition: "after:bg-amber-500/5",
  wellness: "after:bg-rose-500/4",
  ocean: "after:bg-sky-500/5",
  lime: "after:bg-teal-500/5",
  meditation: "after:bg-purple-500/4",
};

/**
 * Reusable Adira Wellness Central Background System.
 *
 * Provides photographic backgrounds for public landing page sections, and a clean,
 * calm, low-saturation warm ivory canvas with soft radial atmospheres for authenticated app pages.
 */
export function WellnessBackground({
  variant = "botanical",
  overlayOpacity = "medium",
  isLanding = false,
  children,
  className,
  glowPosition = "top",
  ...props
}: WellnessBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const bgImage = LANDING_BACKGROUND_MAP[variant] || LANDING_BACKGROUND_MAP.botanical;

  const overlayStyles: Record<"light" | "medium" | "strong" | "none", string> = {
    none: "bg-transparent",
    light: "bg-background/70 dark:bg-background/75 backdrop-blur-[1px]",
    medium: "bg-background/85 dark:bg-background/88 backdrop-blur-[2px]",
    strong: "bg-background/95 dark:bg-background/95 backdrop-blur-[4px]",
  };

  const atmosphereGlowClass = APP_ATMOSPHERE_GLOW[variant] || APP_ATMOSPHERE_GLOW.botanical;

  const glowStyles: Record<"top" | "center" | "bottom" | "none", string> = {
    top: `after:absolute after:top-0 after:left-1/2 after:-translate-x-1/2 after:w-3/4 after:h-56 ${atmosphereGlowClass} after:blur-3xl after:pointer-events-none`,
    center: `after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-2/3 after:h-64 ${atmosphereGlowClass} after:blur-3xl after:pointer-events-none`,
    bottom: `after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:w-3/4 after:h-56 ${atmosphereGlowClass} after:blur-3xl after:pointer-events-none`,
    none: "",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden transition-colors duration-500 bg-background text-foreground",
        glowPosition !== "none" ? glowStyles[glowPosition] : "",
        className
      )}
      {...props}
    >
      {/* Photographic Background Layer (Only on Landing Page) */}
      {isLanding && (
        <>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat transition-opacity duration-700",
              reducedMotion ? "opacity-25 dark:opacity-15" : "opacity-35 dark:opacity-25"
            )}
            style={{ backgroundImage: `url('${bgImage}')` }}
          />

          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 transition-colors duration-300",
              overlayStyles[overlayOpacity]
            )}
          />
        </>
      )}

      {/* Foreground Content */}
      <div className="relative z-0">{children}</div>
    </div>
  );
}

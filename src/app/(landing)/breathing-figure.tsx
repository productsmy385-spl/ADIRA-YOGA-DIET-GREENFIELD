"use client";

import { cn } from "@/lib/utils";

/**
 * Clean Mobile-Responsive Hero Illustration
 *
 * Renders the clean chakra meditation illustration.
 */
export function BreathingFigure({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full max-w-lg mx-auto flex items-center justify-center", className)}>
      {/* Soft ambient background glow */}
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-teal-400/20 to-amber-300/20 blur-xl opacity-70 animate-pulse" />
      
      {/* Hero Illustration */}
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-emerald-500/20 bg-card/60 p-1.5 shadow-xl backdrop-blur-xs transition-all duration-500 hover:shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-bg.png"
          alt="Yoga meditation posture with glowing chakra energy centers surrounded by botanical leaves"
          className="h-auto w-full rounded-xl md:rounded-2xl object-cover"
        />
      </div>
    </div>
  );
}

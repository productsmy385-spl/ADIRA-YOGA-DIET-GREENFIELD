"use client";

import { cn } from "@/lib/utils";

/**
 * Hero Wellness Meditation Illustration
 *
 * Renders the reference botanical yoga chakra illustration with ambient glow
 * and subtle breathing micro-animations.
 */
export function BreathingFigure({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Soft ambient background glow */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-emerald-500/20 via-teal-400/20 to-amber-300/20 blur-2xl transform scale-95 animate-pulse" />
      
      {/* Hero Illustration Container */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-card/60 p-2 shadow-2xl backdrop-blur-md transition-transform duration-700 hover:scale-[1.02]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-bg.jpg"
          alt="Yoga meditation posture with glowing chakra energy centers surrounded by botanical leaves"
          className="h-auto w-full max-w-md rounded-2xl object-cover shadow-inner"
        />
        
        {/* Decorative Floating Leaf / Sparkle Overlays */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-primary backdrop-blur-md border border-primary/20 shadow-xs">
          <span>✨</span>
          <span>Chakra Balance</span>
        </div>

        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 backdrop-blur-md border border-emerald-500/20 shadow-xs">
          <span>🌿</span>
          <span>Natural Mindful Practice</span>
        </div>
      </div>
    </div>
  );
}

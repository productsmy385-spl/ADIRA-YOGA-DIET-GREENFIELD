"use client";

import { cn } from "@/lib/utils";

/**
 * Clean Mobile & Fallback Botanical Chakra Figure
 *
 * Renders an intentional, beautifully styled yoga figure with glowing energy centers
 * and botanical leaf surround when 3D is disabled or under prefers-reduced-motion.
 */
export function BreathingFigure({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full max-w-md mx-auto flex items-center justify-center p-4", className)}>
      {/* Ambient background glow */}
      <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-400/25 to-amber-300/20 blur-2xl opacity-80 animate-pulse" />

      {/* Botanical SVG Yoga Silhouette Container */}
      <div className="relative z-10 w-full aspect-square max-w-[340px] flex items-center justify-center rounded-3xl border border-emerald-500/30 bg-card/60 p-6 shadow-2xl backdrop-blur-md">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full text-primary"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="auraGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--jade)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--emerald)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Glowing Aura Ring */}
          <circle cx="100" cy="100" r="85" fill="url(#auraGlow)" />
          <circle cx="100" cy="100" r="75" stroke="var(--emerald)" strokeWidth="0.75" strokeDasharray="4 4" fill="none" opacity="0.6" />

          {/* Meditating Yoga Figure Silhouette */}
          {/* Head */}
          <circle cx="100" cy="45" r="14" fill="currentColor" opacity="0.9" />
          {/* Spine & Torso */}
          <path d="M100 59 v52" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
          {/* Cross-legged Seated Base */}
          <path d="M48 138 c15-20 37-20 52 0 c15-20 37-20 52 0" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" opacity="0.85" />
          <path d="M55 146 h90" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.7" />

          {/* Chakra Energy Points along the spine (using design tokens) */}
          <circle cx="100" cy="135" r="3.5" fill="var(--terracotta)" />
          <circle cx="100" cy="120" r="3.5" fill="var(--saffron)" />
          <circle cx="100" cy="105" r="3.5" fill="var(--accent)" />
          <circle cx="100" cy="90" r="3.5" fill="var(--emerald)" />
          <circle cx="100" cy="75" r="3.5" fill="var(--jade)" />
          <circle cx="100" cy="62" r="3.5" fill="var(--info)" />
          <circle cx="100" cy="45" r="3" fill="var(--primary)" />

          {/* Subtle Botanical Leaves */}
          <path d="M32 90 C 20 70, 40 50, 50 70 C 40 85, 35 90, 32 90 Z" fill="var(--jade)" opacity="0.6" />
          <path d="M168 90 C 180 70, 160 50, 150 70 C 160 85, 165 90, 168 90 Z" fill="var(--jade)" opacity="0.6" />
        </svg>

        {/* Ambient Badge */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500/30 bg-background/80 px-3.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 backdrop-blur-xs shadow-xs">
          ✨ Mindful Balance
        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function LoadingScreen({ className }: { className?: string }) {
  return (
    <div
      aria-label="Loading Adira Wellness"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md transition-opacity duration-300",
        className
      )}
    >
      <div className="flex flex-col items-center space-y-4">
        {/* Animated Brand Mark */}
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-3 rounded-full bg-emerald-500/20 blur-lg animate-pulse motion-reduce:animate-none" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.icons.mark}
            alt=""
            aria-hidden
            className="size-16 relative z-10 animate-breathe motion-reduce:animate-none mix-blend-multiply dark:mix-blend-screen"
          />
        </div>

        {/* Brand Name */}
        <span className="text-xl font-bold tracking-tight text-foreground">
          {branding.name}
        </span>

        {/* Loading Message */}
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <div className="size-1.5 rounded-full bg-emerald-500 animate-ping motion-reduce:animate-none" />
          <span>Finding your balance...</span>
        </div>
      </div>
    </div>
  );
}

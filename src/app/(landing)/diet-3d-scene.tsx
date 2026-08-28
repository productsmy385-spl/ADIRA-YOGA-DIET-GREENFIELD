"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MealIcon } from "@/components/icons";

const DynamicDietScene = dynamic(
  () => import("@/components/3d/diet-wellness-scene"),
  {
    ssr: false,
    loading: () => <DietFallbackVisual />,
  }
);

function DietFallbackVisual() {
  return (
    <div className="relative size-72 sm:size-80 rounded-3xl border border-amber-500/20 bg-background/80 p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-xl backdrop-blur-md">
      <MealIcon size={64} className="text-amber-600 dark:text-amber-400" />
      <h3 className="font-semibold text-lg text-foreground">Personalized Meal Plan</h3>
      <p className="text-xs text-muted-foreground">Synchronized with your daily yoga and recovery schedule.</p>
    </div>
  );
}

function checkWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export function Diet3DScene({ className }: { className?: string }) {
  const [hasWebGL] = useState<boolean>(checkWebGLSupport);

  if (!hasWebGL) {
    return <DietFallbackVisual />;
  }

  return (
    <div className={className}>
      <DynamicDietScene />
    </div>
  );
}

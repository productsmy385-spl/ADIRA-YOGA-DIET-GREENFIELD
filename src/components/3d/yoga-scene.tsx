"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import type { Group } from "three";

import { YogaFallback, type FallbackReason } from "./yoga-fallback";
import { EMERALD, FOREST, JADE, LIGHT } from "./palette";
import { resolveModel, type YogaPose } from "./yoga-pose";

/**
 * The 3D viewer (15A).
 *
 * NEVER IMPORTED DIRECTLY BY A PAGE. `YogaViewer` below is the entry point and it loads
 * this through `next/dynamic`, so `three` stays out of every bundle that does not render
 * a scene — `/today` above all, which is the journey the product lives on (ADR-014).
 *
 * The fallback is not an error path bolted on afterwards. It is the default, and the
 * canvas is what gets added when the device can take it.
 */

/**
 * The development placeholder figure.
 *
 * Deliberately abstract rather than a crude human. A low-effort humanoid invites the
 * reader to judge it as the finished character; a clearly abstract form reads as
 * scaffolding, which is what it is. 15C replaces it through `model_reference` with no
 * change here.
 */
function PlaceholderFigure({ paused }: { paused: boolean }) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    // The render loop keeps running while the canvas is mounted; pausing the MOTION
    // rather than the loop is what respects reduced motion without tearing down WebGL.
    if (paused || !group.current) return;
    group.current.rotation.y += delta * 0.25;
  });

  return (
    <group ref={group}>
      {/*
        Head, torso, and a seated base — enough to read as a figure at a glance. Colours
        come from `palette.ts`, the one file allowed to hold hex, because a `three`
        material takes a number and cannot read `var(--emerald)`.
      */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color={JADE} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <capsuleGeometry args={[0.28, 0.6, 8, 24]} />
        <meshStandardMaterial color={EMERALD} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.16, 16, 48]} />
        <meshStandardMaterial color={FOREST} roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * Lighting.
 *
 * Warm key, cool fill, no shadows. Shadow maps are the single most expensive thing a
 * scene this simple could enable, and on a mid-range Android they cost more frames than
 * the depth cue is worth.
 */
function YogaLighting() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} color={LIGHT.key} />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color={LIGHT.fill} />
    </>
  );
}

export interface YogaSceneProps {
  pose: YogaPose;
  /** Motion is stilled but the scene stays mounted and readable. */
  paused?: boolean;
  className?: string;
}

export default function YogaScene({ pose, paused = false, className }: YogaSceneProps) {
  const [failed, setFailed] = useState(false);
  const model = useMemo(() => resolveModel(pose), [pose]);

  if (failed) {
    return <YogaFallback pose={pose} reason="load-failed" className={className} />;
  }

  return (
    <div className={className}>
      <div
        className="relative aspect-square w-full overflow-hidden rounded-xl"
        /*
         * The canvas is decorative. Everything it conveys is in the text beneath it, so
         * exposing it to assistive technology would announce an unnavigable canvas
         * element and add nothing.
         */
        aria-hidden
      >
        <Canvas
          camera={{ position: [0, 1.1, 3.2], fov: 42 }}
          dpr={[1, 1.75]}
          /*
           * `frameloop="demand"` when paused: React Three Fiber then renders only when
           * something invalidates, instead of running rAF forever behind a still image.
           * On a phone that is the difference between a warm battery and a flat one.
           */
          frameloop={paused ? "demand" : "always"}
          gl={{ antialias: true, powerPreference: "low-power" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", () => setFailed(true), {
              once: true,
            });
          }}
        >
          <YogaLighting />
          <Suspense fallback={null}>
            <PlaceholderFigure paused={paused} />
          </Suspense>
        </Canvas>
      </div>

      {/*
        The placeholder is labelled on screen. Risk V6 is that development art is mistaken
        for the finished experience, and the honest fix is to say so where it is seen
        rather than only in a document.
      */}
      {model.placeholder && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Development placeholder — the yoga character is not final.
        </p>
      )}

      {/* The text equivalent, always present rather than only on failure. */}
      <YogaFallback pose={pose} reason="no-model" className="mt-4" />
    </div>
  );
}

export type { FallbackReason };

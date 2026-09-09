"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box3, Vector3, type Group } from "three";

import {
  DEFAULT_MARGIN,
  frameClipping,
  frameDistance,
  framePosition,
  frameRotation,
  frameTarget,
} from "./framing";

/**
 * Frames whatever it wraps, whatever size that turns out to be.
 *
 * The arithmetic lives in `framing.ts` and is unit-tested against every breakpoint in the
 * brief. This file does only the two things that need a live scene: MEASURE the object,
 * and describe a camera from the result.
 *
 * ── It renders its own camera rather than steering the scene's ─────────────────
 * The obvious implementation reads `useThree(s => s.camera)` and assigns to `.position`,
 * `.near`, `.far`. That is a React Compiler error — writing to a value a hook returned —
 * and the rule is right: R3F may hand back a camera it also manages, so two owners end up
 * writing the same fields. `yoga-model.tsx` solves the identical problem by constructing
 * its own `AnimationMixer` instead of mutating drei's. Same move here: a
 * `<PerspectiveCamera makeDefault>` we own, driven by props, mutated by nobody.
 *
 * ── Why `useLayoutEffect` ──────────────────────────────────────────────────────
 * The measurement must land before the first paint of a newly loaded model, or a pose
 * switch shows one frame of the new model at the old model's framing — a visible jump on
 * every selection.
 *
 * ── Why it re-runs on `signature` ──────────────────────────────────────────────
 * A pose change swaps geometry without remounting this component, and a box measured for
 * Mountain is wrong for Warrior II. Leaving it out is how framing silently goes stale.
 *
 * ── The skinned-mesh caveat, stated rather than hidden ─────────────────────────
 * `Box3.setFromObject` measures a skinned mesh in its BIND POSE — three cannot cheaply
 * know where the bones have since moved the vertices. A pose extending beyond the bind
 * pose therefore measures small, which is what `DEFAULT_MARGIN` absorbs. If a delivered
 * character still crops on one clip, raise the margin for that pose; do not re-measure per
 * frame, which would traverse the whole skeleton every frame for a slow-moving number.
 */

export interface AutoFrameProps {
  children: ReactNode;
  /**
   * Anything that changes when the framed geometry changes — a pose id is the natural
   * choice. Triggers a re-measure.
   */
  signature?: string;
  /** Vertical field of view, degrees. Ours, because we own the camera. */
  fov?: number;
  /** Breathing room beyond the bounding box. See `DEFAULT_MARGIN`. */
  margin?: number;
  /** Radians. Turns the camera around the figure; some poses only read from the side. */
  azimuth?: number;
  /** Radians. A slight downward tilt reads as instruction; dead level reads as flat. */
  elevation?: number;
}

interface Framing {
  position: [number, number, number];
  rotation: [number, number, number];
  near: number;
  far: number;
}

export function AutoFrame({
  children,
  signature = "",
  fov = 42,
  margin = DEFAULT_MARGIN,
  azimuth = 0,
  elevation = 0.12,
}: AutoFrameProps) {
  const group = useRef<Group>(null);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const invalidate = useThree((state) => state.invalidate);

  const [framing, setFraming] = useState<Framing | null>(null);

  useLayoutEffect(() => {
    const node = group.current;
    if (!node || width <= 0 || height <= 0) return;

    /*
     * The group carries no transform of our own — we move the camera, not the model — so
     * this world-space box is the model's true extent, and measuring it cannot feed back
     * into a transform we then measure again.
     */
    const box = new Box3().setFromObject(node);
    // Empty on the frame before a suspended model resolves. Keeping the previous framing
    // is a better guess than framing a point.
    if (box.isEmpty()) return;

    const dimensions = box.getSize(new Vector3());
    const size = { x: dimensions.x, y: dimensions.y, z: dimensions.z };
    const aspect = width / height;

    const distance = frameDistance({ size, fov, aspect, margin });
    const target = frameTarget(box.min, box.max);
    const position = framePosition(target, distance, azimuth, elevation);
    const { near, far } = frameClipping(distance, size);

    setFraming({
      position: [position.x, position.y, position.z],
      rotation: frameRotation(azimuth, elevation),
      near,
      far,
    });

    // The scene runs `frameloop="demand"` while paused. Without this the newly framed
    // camera is never drawn and the view appears frozen at the old framing.
    invalidate();
  }, [width, height, fov, margin, azimuth, elevation, signature, invalidate]);

  return (
    <>
      {framing ? (
        <PerspectiveCamera
          makeDefault
          fov={fov}
          near={framing.near}
          far={framing.far}
          position={framing.position}
          rotation={framing.rotation}
        />
      ) : null}
      <group ref={group}>{children}</group>
    </>
  );
}

"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AnimationMixer, type AnimationClip } from "three";
import { KTX2Loader, SkeletonUtils } from "three-stdlib";

import { resolveClip } from "./yoga-clips";

/**
 * Loading and animating the production character (15C).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS FILE ASSUMES NOTHING ABOUT THE ASSET BEYOND `docs/3D-ASSET-CONTRACT.md`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * No model path, clip name, bone name or duration is hardcoded. The GLB comes from
 * `yoga_exercises.model_reference` and the clip from `animation_reference`, so integrating
 * the real character is a data change. That is the promise ADR-014 made when 15C was
 * deferred, and it only holds if this file stays free of asset-specific knowledge.
 *
 * DECODERS ARE SELF-HOSTED, from `public/decoders/`, synced out of `three` at build time.
 * A CDN-hosted decoder would be blocked by the Content-Security-Policy, and widening
 * `script-src` so a decoder can load is how a policy stops meaning anything.
 *
 * A MISSING CLIP IS NOT AN ERROR. An organisation may reference a pose whose animation was
 * never authored, or an artist may deliver nine of eleven clips. Either way the character
 * still renders and still holds a pose — see `yoga-clips.ts` for the resolution order.
 * Throwing here would take down the whole yoga experience for one absent string.
 */

const DRACO_PATH = "/decoders/draco/";
const BASIS_PATH = "/decoders/basis/";

/** Cross-fade length. Long enough to read as a transition, short enough not to feel slow. */
const FADE_SECONDS = 0.4;

export interface YogaModelProps {
  /** From `model_reference`. Always a real URL by the time this renders. */
  url: string;
  /** From `animation_reference`. May be absent, may name a clip that does not exist. */
  clipName?: string | null;
  /** Motion stilled — off-screen, or reduced-motion. The pose is still shown. */
  paused?: boolean;
  /** Told which clip actually played, so the caller can report honestly. */
  onClipResolved?: (resolved: { name: string | null; requested: string | null }) => void;
}

export function YogaModel({ url, clipName, paused = false, onClipResolved }: YogaModelProps) {
  const gl = useThree((state) => state.gl);

  /*
   * KTX2 needs the renderer to decide which compressed texture formats this GPU accepts,
   * so it cannot be configured until there is a canvas. Memoised on `gl` because
   * `detectSupport` and the transcoder worker are both expensive to repeat.
   */
  const extendLoader = useMemo(() => {
    return (loader: { setKTX2Loader?: (ktx2: KTX2Loader) => void }) => {
      if (typeof loader.setKTX2Loader !== "function") return;
      const ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(gl);
      loader.setKTX2Loader(ktx2);
    };
  }, [gl]);

  // Suspends while loading and throws on failure. `ModelBoundary` in yoga-scene.tsx
  // catches the throw; the Suspense fallback covers the wait.
  const { scene, animations } = useGLTF(url, DRACO_PATH, false, extendLoader);

  /*
   * CLONE, AND CLONE WITH SkeletonUtils SPECIFICALLY.
   *
   * `useGLTF` caches by URL and hands every caller THE SAME scene object. The journey
   * renders seven sections, and several may use the same character — so without a clone
   * they would all drive one skeleton, and whichever section animated last would win for
   * everybody. The symptom is poses that change when you scroll past an unrelated section.
   *
   * A plain `Object3D.clone()` does not fix it: it copies the meshes but leaves them bound
   * to the ORIGINAL skeleton, so the copies deform in lockstep. `SkeletonUtils.clone`
   * rebuilds the bone hierarchy and rebinds the skinned meshes to it, which is the only
   * correct way to instance a rigged character.
   */
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  /*
   * Our own mixer, on our own clone.
   *
   * drei's `useAnimations` would do this, but it returns a mixer this component then has
   * to mutate to control playback — and mutating a hook's return value is both a lint
   * error and a genuine hazard, since the library may reset it between renders. Owning
   * the mixer makes pausing a method call on a value we constructed.
   */
  const mixer = useMemo(() => new AnimationMixer(model), [model]);

  const clips = animations as AnimationClip[];
  const available = useMemo(() => clips.map((clip) => clip.name), [clips]);
  const resolved = useMemo(() => resolveClip(clipName, available), [clipName, available]);

  useEffect(() => {
    onClipResolved?.({ name: resolved, requested: clipName ?? null });
  }, [resolved, clipName, onClipResolved]);

  /*
   * Play the resolved clip, cross-fading from whatever was running.
   *
   * The cleanup fades OUT rather than stopping: `stop()` snaps the skeleton to its bind
   * pose, which reads as a glitch when a section scrolls away mid-transition.
   */
  useEffect(() => {
    if (!resolved) return;

    const clip = clips.find((candidate) => candidate.name === resolved);
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.reset().fadeIn(FADE_SECONDS).play();

    return () => {
      action.fadeOut(FADE_SECONDS);
    };
  }, [mixer, clips, resolved]);

  /*
   * Advance the animation — or do not, when paused.
   *
   * `update(0)` rather than skipping the call, because that HOLDS the pose. Not updating
   * at all would leave the mixer's internal clock to jump the moment it resumes, and
   * stopping the action would drop the character back to a T-pose — the one thing someone
   * who asked for reduced motion must not be given, since they lose the pose they came to
   * see. Reduced motion removes movement, never information.
   */
  useFrame((_, delta) => {
    mixer.update(paused ? 0 : delta);
  });

  /*
   * The mixer holds per-instance state that would otherwise accumulate across the seven
   * journey sections. The CLONE is disposed with it; the cached original is shared and
   * must be left alone.
   */
  useEffect(() => {
    const current = mixer;
    return () => {
      current.stopAllAction();
      current.uncacheRoot(current.getRoot());
    };
  }, [mixer]);

  return <primitive object={model} />;
}

/*
 * There is deliberately NO exported `preload` helper here.
 *
 * Calling one would mean importing this module — and therefore `three` — from whatever
 * wanted to preload, which is exactly the static import `no-3d-on-today.test.ts` forbids.
 * The preload already happens without it: `useOnScreen` in `yoga-viewer.tsx` uses a 200px
 * `rootMargin`, so a section begins loading before it is scrolled to.
 */

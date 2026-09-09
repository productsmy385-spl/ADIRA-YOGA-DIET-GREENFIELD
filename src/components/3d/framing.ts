/**
 * Camera framing, as arithmetic rather than as tuned constants.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `yoga-scene.tsx` framed its camera with `position: [0, 1.1, 3.2], fov: 42` — three
 * numbers hand-tuned against the placeholder figure. They are correct for exactly one
 * model at exactly one aspect ratio, and nothing says so. A real character is a different
 * height, sits at a different origin, and is viewed in a container that is portrait on a
 * 360px phone and landscape on a 1920px desktop. Hardcoded numbers cannot survive any of
 * that, and the failure is silent: the head leaves the frame, or the figure shrinks to a
 * dot, and the build still passes.
 *
 * So the distance is COMPUTED from the model's own bounding box and the live viewport
 * aspect. Drop in a taller character and it frames itself; rotate a phone and it reframes.
 *
 * The maths lives here, pure and free of `three`, so it can be tested without a WebGL
 * context — the same split `yoga-clips.ts` uses. `auto-frame.tsx` is the thin component
 * that measures a real object and calls into this.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FrameInput {
  /** Bounding-box dimensions in world units (metres, per the asset contract §2). */
  size: Vec3;
  /** Vertical field of view in DEGREES — `PerspectiveCamera.fov`'s own unit. */
  fov: number;
  /** Viewport width ÷ height. Portrait is < 1. */
  aspect: number;
  /**
   * Breathing room. 1.0 frames the bounding box edge-to-edge, which crops the moment a
   * limb extends during an animation — Warrior II is materially wider than the bind pose
   * the box was measured in.
   */
  margin?: number;
}

/** Enough clearance that a raised arm or an extended leg cannot touch the frame edge. */
export const DEFAULT_MARGIN = 1.22;

/** Degenerate input has to produce SOMETHING a camera can use, not NaN. */
const FALLBACK_DISTANCE = 3.2;

function isUsable(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * How far back the camera must sit for the whole bounding box to be visible.
 *
 * Both axes are checked and the LARGER distance wins. Checking only height is the common
 * shortcut and it is wrong for this product specifically: Warrior II is a wide pose, so
 * on a portrait phone — where the horizontal field of view is the narrow one — fitting
 * the height still leaves the hands outside the frame.
 *
 * Half the depth is then added. The box is measured in world space, so a figure one metre
 * deep has geometry half a metre nearer the camera than its centre; without this the
 * near face of the model crosses the computed distance and clips.
 */
export function frameDistance({ size, fov, aspect, margin = DEFAULT_MARGIN }: FrameInput): number {
  if (!isUsable(fov) || fov >= 180) return FALLBACK_DISTANCE;
  if (!isUsable(aspect)) return FALLBACK_DISTANCE;

  const width = Math.max(0, size.x);
  const height = Math.max(0, size.y);
  const depth = Math.max(0, size.z);

  // A zero-sized box means the model has not loaded, or has no geometry. Framing "nothing"
  // at distance 0 would put the camera inside the origin and render a grey void.
  if (width === 0 && height === 0) return FALLBACK_DISTANCE;

  const halfVertical = Math.tan((fov * Math.PI) / 360);
  const halfHorizontal = halfVertical * aspect;

  const forHeight = height / 2 / halfVertical;
  const forWidth = width / 2 / halfHorizontal;

  const distance = Math.max(forHeight, forWidth) * margin + depth / 2;

  return isUsable(distance) ? distance : FALLBACK_DISTANCE;
}

/**
 * Where the camera should look.
 *
 * The box CENTRE, not the origin. The asset contract §2 puts a model's origin between the
 * feet at floor level, so aiming at the origin points the camera at the mat and pushes the
 * figure into the top half of the frame — which reads as a framing bug even though every
 * number involved is correct.
 */
export function frameTarget(min: Vec3, max: Vec3): Vec3 {
  return {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
}

/**
 * Camera position for a target, a distance and a viewing angle.
 *
 * `elevation` is a slight downward tilt — looking at a standing figure from dead level
 * flattens it, and looking from far above reads as surveillance rather than instruction.
 * `azimuth` turns the camera around the figure so a pose can be shown from the side when
 * that is the readable angle (Warrior II is unreadable head-on).
 */
export function framePosition(
  target: Vec3,
  distance: number,
  azimuth = 0,
  elevation = 0.12,
): Vec3 {
  const horizontal = distance * Math.cos(elevation);
  return {
    x: target.x + horizontal * Math.sin(azimuth),
    y: target.y + distance * Math.sin(elevation),
    z: target.z + horizontal * Math.cos(azimuth),
  };
}

/**
 * The camera's rotation, as an Euler triple in `YXZ` order.
 *
 * Returned instead of calling `camera.lookAt`, because `lookAt` MUTATES a camera — and the
 * only camera available to mutate is one handed over by `useThree`. Writing to a hook's
 * return value is a React Compiler error and a genuine hazard, the same one
 * `yoga-model.tsx` avoids by constructing its own `AnimationMixer`. So the rotation is
 * computed here as plain numbers and applied declaratively to a camera we own.
 *
 * The maths collapses to almost nothing because `framePosition` places the camera on a
 * sphere around the target using the same two angles. Substituting its output into a
 * general look-at gives yaw = azimuth and pitch = −elevation exactly, with no roll — so
 * the general case is never needed and no matrix is built.
 *
 * `YXZ` specifically: it applies yaw before pitch, which is what keeps the horizon level.
 * The default `XYZ` tilts and rolls together and the figure appears to lean.
 */
export function frameRotation(azimuth = 0, elevation = 0.12): [number, number, number] {
  return [-elevation, azimuth, 0];
}

/**
 * What the camera can see at a given distance — the inverse of `frameDistance`.
 *
 * Exported because it is how the tests prove the framing property that matters: that the
 * visible extent is at least the model's extent, i.e. nothing is cropped.
 */
export function visibleExtent(
  distance: number,
  fov: number,
  aspect: number,
): { width: number; height: number } {
  const height = 2 * distance * Math.tan((fov * Math.PI) / 360);
  return { height, width: height * aspect };
}

/**
 * Near and far planes derived from the framing.
 *
 * Fixed planes waste depth precision. A near plane of 0.1 against a far plane of 1000 —
 * three's defaults — spends most of the depth buffer on space nothing occupies, which
 * shows up as z-fighting between a character's hand and their thigh in a close pose.
 */
export function frameClipping(distance: number, size: Vec3): { near: number; far: number } {
  const extent = Math.max(size.x, size.y, size.z, 0.1);
  return {
    near: Math.max(0.01, (distance - extent) / 4),
    far: distance + extent * 4,
  };
}

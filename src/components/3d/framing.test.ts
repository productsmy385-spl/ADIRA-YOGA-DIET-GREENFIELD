import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARGIN,
  frameClipping,
  frameDistance,
  framePosition,
  frameRotation,
  frameTarget,
  visibleExtent,
  type Vec3,
} from "./framing";

/**
 * Framing is the difference between a character and a cropped character, and neither a
 * typecheck nor a render test can tell them apart — a decapitated figure renders happily.
 * So the property that actually matters is asserted arithmetically here: at the computed
 * distance, IS THE WHOLE BOUNDING BOX INSIDE THE FRUSTUM.
 */

/** A character built to the asset contract §2: 1.7 m tall, origin between the feet. */
const STANDING: Vec3 = { x: 0.65, y: 1.7, z: 0.4 };

/** Warrior II — the widest pose in the required clip set, and the one that crops first. */
const WARRIOR: Vec3 = { x: 1.75, y: 1.45, z: 0.45 };

/** Child's pose — long and low, so width dominates by a wide margin. */
const CHILD: Vec3 = { x: 1.6, y: 0.6, z: 0.5 };

const FOV = 42;

/**
 * The viewport widths named in the brief, each with the aspect its 3D container actually
 * gets in the current layout: a full-width square below `lg`, and roughly square in the
 * half-width column above it. The portrait cases are the ones that catch width cropping.
 */
const BREAKPOINTS = [
  { width: 360, aspect: 0.72 },
  { width: 390, aspect: 0.78 },
  { width: 430, aspect: 0.86 },
  { width: 768, aspect: 1.0 },
  { width: 1024, aspect: 1.1 },
  { width: 1280, aspect: 1.2 },
  { width: 1440, aspect: 1.35 },
  { width: 1920, aspect: 1.6 },
];

describe("frameDistance — nothing is ever cropped", () => {
  for (const model of [STANDING, WARRIOR, CHILD]) {
    for (const { width, aspect } of BREAKPOINTS) {
      it(`fits ${model.x}×${model.y}m at ${width}px (aspect ${aspect})`, () => {
        const distance = frameDistance({ size: model, fov: FOV, aspect });
        const seen = visibleExtent(distance, FOV, aspect);

        // The whole box fits, with the margin still to spare.
        expect(seen.height).toBeGreaterThanOrEqual(model.y);
        expect(seen.width).toBeGreaterThanOrEqual(model.x);
      });
    }
  }

  it("chooses width over height on a portrait viewport for a wide pose", () => {
    // Warrior II is 1.75m wide and 1.45m tall. On a narrow phone the horizontal field of
    // view is the tight one, so framing by height alone would put the hands off-screen.
    const aspect = 0.72;
    const distance = frameDistance({ size: WARRIOR, fov: FOV, aspect });

    const byHeightOnly = WARRIOR.y / 2 / Math.tan((FOV * Math.PI) / 360);
    expect(distance).toBeGreaterThan(byHeightOnly);
  });

  it("pulls further back for a taller model", () => {
    const short = frameDistance({ size: { x: 0.6, y: 1.2, z: 0.3 }, fov: FOV, aspect: 1 });
    const tall = frameDistance({ size: { x: 0.6, y: 2.1, z: 0.3 }, fov: FOV, aspect: 1 });
    expect(tall).toBeGreaterThan(short);
  });

  it("adds half the model depth so the near face cannot clip", () => {
    const flat = frameDistance({ size: { x: 1, y: 1, z: 0 }, fov: FOV, aspect: 1 });
    const deep = frameDistance({ size: { x: 1, y: 1, z: 1 }, fov: FOV, aspect: 1 });
    expect(deep - flat).toBeCloseTo(0.5, 5);
  });

  it("applies the margin", () => {
    const tight = frameDistance({ size: STANDING, fov: FOV, aspect: 1, margin: 1 });
    const roomy = frameDistance({ size: STANDING, fov: FOV, aspect: 1, margin: DEFAULT_MARGIN });
    expect(roomy).toBeGreaterThan(tight);
  });

  /**
   * A zero box means "not loaded yet", which happens on every first frame. Returning 0
   * would put the camera at the target and render a grey void that looks like a crash.
   */
  it.each([
    ["zero size", { size: { x: 0, y: 0, z: 0 }, fov: FOV, aspect: 1 }],
    ["zero aspect", { size: STANDING, fov: FOV, aspect: 0 }],
    ["zero fov", { size: STANDING, fov: 0, aspect: 1 }],
    ["fov >= 180", { size: STANDING, fov: 180, aspect: 1 }],
    ["NaN aspect", { size: STANDING, fov: FOV, aspect: Number.NaN }],
  ])("falls back to a usable distance for %s", (_label, input) => {
    const distance = frameDistance(input);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });
});

describe("frameTarget", () => {
  /**
   * The contract puts the origin between the feet, so a model occupies y ∈ [0, 1.7].
   * Aiming at y=0 is aiming at the mat.
   */
  it("aims at the centre of the box, not the origin", () => {
    const target = frameTarget({ x: -0.3, y: 0, z: -0.2 }, { x: 0.3, y: 1.7, z: 0.2 });
    expect(target).toEqual({ x: 0, y: 0.85, z: 0 });
  });
});

describe("framePosition", () => {
  it("sits the camera the requested distance from the target", () => {
    const target: Vec3 = { x: 0, y: 0.85, z: 0 };
    const distance = 4;
    const p = framePosition(target, distance, 0, 0.12);

    const actual = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
    expect(actual).toBeCloseTo(distance, 6);
  });

  it("raises the camera above the target for a slight downward look", () => {
    const target: Vec3 = { x: 0, y: 0.85, z: 0 };
    const p = framePosition(target, 4, 0, 0.12);
    expect(p.y).toBeGreaterThan(target.y);
  });

  it("swings around the figure with azimuth", () => {
    const target: Vec3 = { x: 0, y: 1, z: 0 };
    const side = framePosition(target, 4, Math.PI / 2, 0);
    expect(side.x).toBeCloseTo(4, 6);
    expect(side.z).toBeCloseTo(0, 6);
  });
});

describe("frameRotation — the camera actually points at the target", () => {
  /**
   * `frameRotation` replaces `camera.lookAt`, so the one property worth proving is that it
   * produces the SAME orientation lookAt would. Rather than trusting the closed form, this
   * applies the returned Euler (order YXZ) to the camera's local backward axis (0,0,1) and
   * checks the result equals the normalised direction from target to camera. If those
   * agree, the camera is looking at the target.
   */
  function backwardAxisFromEuler([pitch, yaw]: [number, number, number]): Vec3 {
    // Ry(yaw) · Rx(pitch) · (0,0,1)
    return {
      x: Math.sin(yaw) * Math.cos(pitch),
      y: -Math.sin(pitch),
      z: Math.cos(yaw) * Math.cos(pitch),
    };
  }

  const ANGLES: Array<[number, number]> = [
    [0, 0],
    [0, 0.12],
    [Math.PI / 2, 0.12],
    [-Math.PI / 4, 0.3],
    [Math.PI, 0.05],
  ];

  for (const [azimuth, elevation] of ANGLES) {
    it(`points at the target for azimuth ${azimuth.toFixed(2)}, elevation ${elevation}`, () => {
      const target: Vec3 = { x: 0, y: 0.85, z: 0 };
      const distance = 4;

      const position = framePosition(target, distance, azimuth, elevation);
      const rotation = frameRotation(azimuth, elevation);

      // Direction from target to camera, normalised.
      const dx = position.x - target.x;
      const dy = position.y - target.y;
      const dz = position.z - target.z;
      const length = Math.hypot(dx, dy, dz);
      const expected = { x: dx / length, y: dy / length, z: dz / length };

      const actual = backwardAxisFromEuler(rotation);

      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
      expect(actual.z).toBeCloseTo(expected.z, 6);
    });
  }

  it("never rolls the camera, so the horizon stays level", () => {
    expect(frameRotation(1.2, 0.4)[2]).toBe(0);
  });
});

describe("frameClipping", () => {
  it("keeps the whole model between the near and far planes", () => {
    const distance = frameDistance({ size: STANDING, fov: FOV, aspect: 1 });
    const { near, far } = frameClipping(distance, STANDING);

    const nearest = distance - Math.max(STANDING.x, STANDING.y, STANDING.z);
    const furthest = distance + Math.max(STANDING.x, STANDING.y, STANDING.z);

    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(nearest);
    expect(far).toBeGreaterThan(furthest);
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YogaViewer } from "./yoga-viewer";
import type { YogaPose } from "./yoga-pose";

/**
 * 15D: the degradation contract.
 *
 * THE INSTRUCTION MUST REACH THE PERSON PRACTISING, whatever their device does. A
 * consultant's guidance is the product; the 3D scene is an enhancement layered over it.
 * So every path that cannot render a canvas must still deliver the pose's name, Sanskrit
 * name, duration and instructions — and these tests assert exactly that, for each reason
 * separately, because they are different problems for the reader and they are reached by
 * different code.
 *
 * jsdom gives no WebGL context, which is convenient: it IS the no-WebGL device, so the
 * fallback path is the one under test by default rather than something simulated.
 *
 * `three` is never imported here. That is deliberate and load-bearing — the viewer's whole
 * job is to keep it behind `next/dynamic`, and a test that pulled it in would be testing a
 * different module graph than the one that ships. `no-3d-on-today.test.ts` guards the
 * other direction.
 */

const POSE: YogaPose = {
  id: "pose-1",
  name: "Mountain pose",
  sanskritName: "Tadasana",
  instructions: "Stand with the feet together, weight even through both soles.",
  breathing: "Breathe evenly through the nose.",
  durationSeconds: 300,
  difficulty: "BEGINNER",
  modelReference: "tadasana.glb",
};

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Everything the fallback must carry, whichever reason produced it. */
function expectInstructionsPresent() {
  expect(screen.getByText("Mountain pose")).toBeInTheDocument();
  expect(screen.getByText("Tadasana")).toBeInTheDocument();
  expect(screen.getByText(/weight even through both soles/i)).toBeInTheDocument();
}

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reduced motion", () => {
  it("shows the text alternative rather than a canvas", () => {
    mockReducedMotion(true);
    render(<YogaViewer pose={POSE} />);

    expectInstructionsPresent();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("says why, so the reader knows nothing is broken", () => {
    // Reduced motion removes MOVEMENT, never information — and an unexplained switch to
    // text reads as a failure. Naming the reason is the difference.
    mockReducedMotion(true);
    render(<YogaViewer pose={POSE} />);

    expect(screen.getByText(/reduced motion/i)).toBeInTheDocument();
  });
});

describe("no WebGL", () => {
  it("falls back to the instructions on a device with no context", () => {
    // jsdom returns null from getContext, so this is the genuine no-WebGL path.
    render(<YogaViewer pose={POSE} />);

    expectInstructionsPresent();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("tells the reader their device cannot show it, not that it failed", () => {
    render(<YogaViewer pose={POSE} />);
    expect(screen.getByText(/cannot show the 3D guide/i)).toBeInTheDocument();
  });
});

describe("no model", () => {
  it("shows the instructions with no apology", () => {
    // A pose with no model is NORMAL, not an error. Explaining it would invent a problem
    // the reader does not have.
    render(<YogaViewer pose={{ ...POSE, modelReference: null }} forceFallback="no-model" />);

    expectInstructionsPresent();
    expect(screen.queryByText(/did not load|cannot show/i)).toBeNull();
  });
});

describe("load failure", () => {
  it("distinguishes a failure from an unsupported device", () => {
    render(<YogaViewer pose={POSE} forceFallback="load-failed" />);

    expectInstructionsPresent();
    expect(screen.getByText(/did not load/i)).toBeInTheDocument();
  });
});

describe("the information contract", () => {
  it("carries the same instructions down every degradation path", () => {
    // The property that matters, asserted across all four reasons at once: no path may
    // become the only one that drops the guidance.
    for (const reason of ["no-webgl", "load-failed", "reduced-motion", "no-model"] as const) {
      const { unmount } = render(<YogaViewer pose={POSE} forceFallback={reason} />);
      expectInstructionsPresent();
      unmount();
    }
  });

  it("never renders 3D on the server pass", () => {
    // `ssr: false` on the dynamic import, plus a server snapshot of `null` for WebGL
    // support. A canvas appearing during hydration would mean `three` is in the server
    // bundle — which is how /today silently gains 600 KB.
    render(<YogaViewer pose={POSE} />);
    expect(document.querySelector("canvas")).toBeNull();
  });
});

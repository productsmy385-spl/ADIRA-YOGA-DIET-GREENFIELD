import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Reveal, Stagger } from "./reveal";

/**
 * The one property worth testing here: **a reveal never hides content it cannot show
 * again.**
 *
 * Every other detail of this component is timing and taste. This one is a
 * blank-page-in-production bug, and it is invisible in the happy path — the developer who
 * writes the reveal has JavaScript, has an IntersectionObserver, and has motion enabled,
 * so they will never see it fail. It only appears for the reader on an old browser, or
 * behind a proxy that mangled the bundle, or with a motion preference set.
 *
 * So the assertions below are all variations on "content is on the screen":
 *
 *   · before any effect runs (server-rendered markup)
 *   · when IntersectionObserver does not exist
 *   · when the reader has asked for reduced motion
 *   · when the observer exists but never fires
 */

const originalIO = globalThis.IntersectionObserver;

/** An observer that records instances and never invokes its callback unless told to. */
function stubObserver() {
  const instances: {
    callback: IntersectionObserverCallback;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];

  class Stub {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds: readonly number[] = [];

    constructor(public callback: IntersectionObserverCallback) {
      instances.push({
        callback,
        observe: this.observe,
        disconnect: this.disconnect,
      });
    }
  }

  globalThis.IntersectionObserver = Stub as unknown as typeof IntersectionObserver;
  return instances;
}

function setReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

beforeEach(() => {
  setReducedMotion(false);
});

afterEach(() => {
  globalThis.IntersectionObserver = originalIO;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Reveal never hides content it cannot reveal", () => {
  it("renders its children when an observer exists and has not yet fired", () => {
    stubObserver();

    render(
      <Reveal>
        <p>Personalised yoga</p>
      </Reveal>,
    );

    // Present in the DOM and readable. It carries the hidden ATTRIBUTE, which is the
    // animation's starting frame — but the text is there for a screen reader and for
    // anyone whose stylesheet did not load.
    expect(screen.getByText("Personalised yoga")).toBeInTheDocument();
  });

  it("does not hide anything when IntersectionObserver is unavailable", () => {
    // An older browser, or a stripped-down webview — both of which real customers use.
    // @ts-expect-error deliberately removing the global for this case
    delete globalThis.IntersectionObserver;

    const { container } = render(
      <Reveal>
        <p>Daily practice</p>
      </Reveal>,
    );

    expect(screen.getByText("Daily practice")).toBeInTheDocument();
    // No data-reveal at all: the CSS that sets `opacity: 0` cannot match.
    expect(container.querySelector("[data-reveal]")).toBeNull();
  });

  it("opts out entirely under prefers-reduced-motion", () => {
    setReducedMotion(true);
    const instances = stubObserver();

    const { container } = render(
      <Reveal>
        <p>Your progress</p>
      </Reveal>,
    );

    expect(screen.getByText("Your progress")).toBeInTheDocument();
    expect(container.querySelector("[data-reveal]")).toBeNull();
    // And no observer is created — reduced motion is an opt-out, not a faster animation.
    expect(instances).toHaveLength(0);
  });

  it("reveals when the observer reports the element as visible", () => {
    const instances = stubObserver();

    const { container } = render(
      <Reveal>
        <p>Nutrition</p>
      </Reveal>,
    );

    expect(container.querySelector('[data-reveal="hidden"]')).not.toBeNull();

    const observer = instances[0];
    expect(observer).toBeDefined();

    // Wrapped in `act` because the callback drives a setState from outside React's
    // event system, exactly as the real observer does.
    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(container.querySelector('[data-reveal="shown"]')).not.toBeNull();
    // Revealed once. Re-hiding on scroll-out makes already-read content flicker.
    expect(observer.disconnect).toHaveBeenCalled();
  });
});

describe("Stagger", () => {
  it("renders every child, and caps the delay so a long list does not stall", () => {
    stubObserver();

    const items = Array.from({ length: 12 }, (_, i) => <p key={i}>Item {i}</p>);

    const { container } = render(<Stagger step={40} maxStaggered={8}>{items}</Stagger>);

    // Nothing is dropped.
    for (let i = 0; i < 12; i += 1) {
      expect(screen.getByText(`Item ${i}`)).toBeInTheDocument();
    }

    const delays = [...container.querySelectorAll("[style]")].map((el) =>
      (el as HTMLElement).style.getPropertyValue("--reveal-delay"),
    );

    expect(delays[0]).toBe("0ms");
    expect(delays[8]).toBe("320ms");
    // Past the cap every remaining child shares the final delay rather than growing.
    expect(delays[11]).toBe("320ms");
  });
});

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount between tests. Without this, a component left mounted by one test is still in
// the document for the next, and queries like getByRole start matching the wrong element
// — which produces failures that look like bugs in the component under test.
afterEach(cleanup);

/**
 * jsdom implements neither of these, and Radix (which shadcn/ui builds on) calls both.
 * Without the stubs, every dialog test fails on an unrelated TypeError before it can
 * assert anything about focus or keyboard behaviour.
 */
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix uses these for focus scoping and scroll locking.
Element.prototype.scrollIntoView ??= vi.fn();
Element.prototype.hasPointerCapture ??= vi.fn(() => false);
Element.prototype.setPointerCapture ??= vi.fn();
Element.prototype.releasePointerCapture ??= vi.fn();

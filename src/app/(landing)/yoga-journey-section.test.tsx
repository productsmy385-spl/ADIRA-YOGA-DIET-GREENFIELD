import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { YogaJourneySection } from "./yoga-journey-section";

/**
 * Guards the pose selector against the exact defect it shipped with.
 *
 * The cards were `<div>`s driven only by scroll position — no handler, no role, no way
 * for a mouse or a keyboard to choose a pose. That is this codebase's documented failure
 * mode in its purest form: code that exists, typechecks, lints and has no route by which
 * a person can reach it. `tests/no-orphaned-actions.test.ts` catches the import-level
 * version; nothing catches a control that renders but does not respond, so this does.
 *
 * The assertions are deliberately about the CONTRACT a reader experiences — a real
 * button, a pressed state, and a caption that agrees with it — rather than about class
 * names, which would break on any restyle and prove nothing.
 */

const POSES = ["Mountain Pose", "Warrior II", "Tree Pose", "Child's Pose"];

function poseButton(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name: new RegExp(name, "i") }) as HTMLButtonElement;
}

describe("YogaJourneySection — pose selection", () => {
  it("renders every pose as a real button, not a div", () => {
    render(<YogaJourneySection />);

    for (const pose of POSES) {
      const button = poseButton(pose);
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe("BUTTON");
      // A control that cannot report its state is not usable by assistive technology.
      expect(button).toHaveAttribute("aria-pressed");
    }
  });

  it("marks the clicked pose as pressed and every other pose as not pressed", () => {
    render(<YogaJourneySection />);

    fireEvent.click(poseButton("Tree Pose"));

    expect(poseButton("Tree Pose")).toHaveAttribute("aria-pressed", "true");
    for (const other of POSES.filter((p) => p !== "Tree Pose")) {
      expect(poseButton(other)).toHaveAttribute("aria-pressed", "false");
    }
  });

  /**
   * The caption and the figure share one piece of state. Before the fix the figure ran a
   * 4.5-second timer of its own, so the caption could name a pose the figure was not
   * holding — the "visually disconnected" complaint. Each card always prints its own
   * Sanskrit name, so the ACTIVE pose's name appears twice (card + caption) and every
   * other pose's exactly once. That count is what proves the two agree.
   *
   * Asserted only after a click, never on the initial render: jsdom reports every
   * `getBoundingClientRect()` as zero, so `useScrollStep` reads "fully scrolled" at mount
   * and starts on the last pose. That is an artifact of the environment having no layout,
   * not behaviour worth pinning — a real browser starts at the first pose.
   */
  it("updates the caption over the figure to match the chosen pose", () => {
    render(<YogaJourneySection />);

    fireEvent.click(poseButton("Warrior II"));

    expect(screen.getAllByText("Virabhadrasana II")).toHaveLength(2);
    expect(screen.getAllByText("Tadasana")).toHaveLength(1);
    expect(screen.getAllByText("Vrikshasana")).toHaveLength(1);

    fireEvent.click(poseButton("Tree Pose"));

    expect(screen.getAllByText("Vrikshasana")).toHaveLength(2);
    expect(screen.getAllByText("Virabhadrasana II")).toHaveLength(1);
  });

  it("moves the selection with the arrow keys and wraps at both ends", () => {
    render(<YogaJourneySection />);

    fireEvent.keyDown(poseButton("Mountain Pose"), { key: "ArrowDown" });
    expect(poseButton("Warrior II")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(poseButton("Warrior II"), { key: "ArrowUp" });
    expect(poseButton("Mountain Pose")).toHaveAttribute("aria-pressed", "true");

    // Wrap backwards off the first item onto the last.
    fireEvent.keyDown(poseButton("Mountain Pose"), { key: "ArrowUp" });
    expect(poseButton("Child's Pose")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(poseButton("Child's Pose"), { key: "Home" });
    expect(poseButton("Mountain Pose")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(poseButton("Mountain Pose"), { key: "End" });
    expect(poseButton("Child's Pose")).toHaveAttribute("aria-pressed", "true");
  });

  /**
   * Scroll is a storyteller, not an authority. Once a reader has chosen, a later scroll
   * must not silently move the selection out from under them — which would reproduce the
   * original "the control does not do anything" feeling with a handler attached.
   */
  it("stops letting scroll override the selection once a pose is chosen", () => {
    render(<YogaJourneySection />);

    fireEvent.click(poseButton("Child's Pose"));
    fireEvent.scroll(window);

    expect(poseButton("Child's Pose")).toHaveAttribute("aria-pressed", "true");
  });

  it("labels the selector so the group is announced", () => {
    render(<YogaJourneySection />);
    expect(screen.getByRole("group", { name: /choose a yoga pose/i })).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog, GlassDialog } from "./glass-dialog";

/**
 * `GlassDialog` wraps `FormDialog` for styling only. These tests exist to prove the
 * wrapper did not quietly cost anything — the behaviours below are the ones that are
 * easy to lose and hard to notice, and `form-dialog.test.tsx` covers them on the
 * component underneath.
 */

function Harness({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <GlassDialog
      open={open}
      onOpenChange={setOpen}
      title="End this assignment"
      description="Their remaining scheduled activities are removed."
      onSubmit={onSubmit}
    >
      <label htmlFor="note">Note</label>
      <input id="note" defaultValue="keep me" />
    </GlassDialog>
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("GlassDialog", () => {
  it("keeps the accessible name and description", () => {
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("End this assignment");
    expect(dialog).toHaveAccessibleDescription(
      "Their remaining scheduled activities are removed.",
    );
  });

  it("still closes on Escape when idle", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // The behaviour most worth re-proving through the wrapper: React batches state, so a
  // guard based on `pending` lets two clicks in one tick both submit.
  it("still submits only once on a double click", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn().mockReturnValue(gate.promise);

    render(<Harness onSubmit={onSubmit} />);
    const save = screen.getByRole("button", { name: "Save" });
    await Promise.all([user.click(save), user.click(save)]);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    gate.resolve();
  });

  it("still refuses to dismiss mid-write", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    render(<Harness onSubmit={() => gate.promise} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Working…" });
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    gate.resolve();
  });

  it("still announces failure and keeps the input", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockRejectedValue(new Error("Not assigned"))} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not assigned");
    expect(screen.getByLabelText("Note")).toHaveValue("keep me");
  });

  /**
   * The sheet/dialog switch is a media query, which jsdom does not evaluate — so this
   * asserts the classes are present rather than that the layout applied. Rendering is
   * verified on a real device in 15D; pinning the classes here at least catches their
   * removal.
   */
  it("carries both the mobile sheet and desktop dialog positioning", () => {
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    const dialog = screen.getByRole("dialog");

    expect(dialog.className).toContain("bottom-0");
    expect(dialog.className).toContain("sm:top-1/2");
    // dvh, not vh: mobile Safari's `vh` includes the retracting toolbar, so an 85vh
    // sheet puts its confirm button under the browser chrome.
    expect(dialog.className).toContain("max-h-[85dvh]");
    // Keeps the confirm button clear of the iOS home indicator.
    expect(dialog.className).toContain("env(safe-area-inset-bottom)");
  });

  it("uses the level-2 glass surface, not a bespoke blur", () => {
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    const dialog = screen.getByRole("dialog");

    expect(dialog.className).toContain("backdrop-blur-panel");
    expect(dialog.className).toContain("bg-surface-glass-strong");
    // A hardcoded blur would mean the token system has been bypassed.
    expect(dialog.className).not.toMatch(/backdrop-blur-\[/);
  });
});

describe("ConfirmDialog", () => {
  /**
   * The consequence is the accessible description, so a screen-reader user hears WHAT
   * WILL HAPPEN as part of the dialog announcement — rather than "Are you sure?", which
   * prevents no mistakes.
   */
  it("announces the consequence, not a generic question", async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="End this assignment"
        consequence="Their remaining scheduled activities are removed. Completed days are kept."
        onConfirm={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Their remaining scheduled activities are removed. Completed days are kept.",
    );
  });

  it("requires an explicit confirm click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="End this assignment"
        consequence="This cannot be undone here."
        confirmLabel="End assignment"
        onConfirm={onConfirm}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "End assignment" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

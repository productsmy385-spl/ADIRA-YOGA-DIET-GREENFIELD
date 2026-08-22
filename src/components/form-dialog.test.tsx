import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FormDialog } from "./form-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * These tests exist because §28's requirements — focus management, keyboard
 * accessibility, loading and error states — are the kind of thing that is easy to claim
 * and easy to lose. A regression here is silent: the dialog still looks right.
 */

function Harness({
  onSubmit,
  destructive,
}: {
  onSubmit: () => Promise<void>;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="Add a consultation note"
      description="Visible to consultants in this organisation."
      onSubmit={onSubmit}
      destructive={destructive}
    >
      <Label htmlFor="note">Note</Label>
      <Input id="note" defaultValue="knee still sore" />
    </FormDialog>
  );
}

/** A promise the test controls, so "pending" is a state we can inspect. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FormDialog — structure and accessibility", () => {
  it("exposes a dialog with an accessible name and description", () => {
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Add a consultation note");
    expect(dialog).toHaveAccessibleDescription(
      "Visible to consultants in this organisation.",
    );
  });

  it("closes on Escape when idle", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes via the cancel button", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockResolvedValue(undefined)} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("FormDialog — submission", () => {
  it("calls onSubmit and closes on success", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("submits when Enter is pressed in a field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("Note"));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  /**
   * The bug this component exists to prevent. Two clicks inside one React batch both
   * observe pending === false, so a state-based guard lets both through. A human cannot
   * click twice in one frame — but a phone double-tap or a held Enter key can, and the
   * result is two consultation notes, or two of whatever was being written.
   */
  it("submits only once when clicked twice in immediate succession", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onSubmit = vi.fn().mockReturnValue(gate.promise);

    render(<Harness onSubmit={onSubmit} />);
    const save = screen.getByRole("button", { name: "Save" });

    await Promise.all([user.click(save), user.click(save)]);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    gate.resolve();
  });
});

describe("FormDialog — pending state", () => {
  it("shows progress and disables both actions while in flight", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    render(<Harness onSubmit={() => gate.promise} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const working = await screen.findByRole("button", { name: "Working…" });
    expect(working).toBeDisabled();
    // aria-busy says "in progress"; disabled alone only says "you cannot do this".
    expect(working).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    gate.resolve();
  });

  // Closing mid-write leaves the user with no idea whether their change landed.
  it("ignores Escape while the submission is in flight", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    render(<Harness onSubmit={() => gate.promise} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Working…" });

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    gate.resolve();
  });
});

describe("FormDialog — failure", () => {
  it("announces the error and keeps the dialog open with input intact", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Consultant is not assigned"));

    render(<Harness onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Save" }));

    // role="alert" is what makes this reach a screen-reader user rather than only
    // appearing as red text.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Consultant is not assigned");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).toHaveValue("knee still sore");
  });

  it("re-enables the actions so the user can retry", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockRejectedValue(new Error("nope"))} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("allows a retry to succeed after a failure", async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);

    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("reports a non-Error rejection without leaking its shape to the user", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn().mockRejectedValue({ code: 42 })} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});

describe("FormDialog — destructive variant", () => {
  it("still requires an explicit confirm click", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<Harness onSubmit={onSubmit} destructive />);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

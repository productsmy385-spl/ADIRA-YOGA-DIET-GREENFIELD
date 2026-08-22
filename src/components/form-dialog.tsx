"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The standard form dialog.
 *
 * The brief (§28) requires every dialog to carry a title and description, validation,
 * loading/error/success states, cancel, keyboard accessibility, focus management, and a
 * mobile layout. Those requirements are met once, here, rather than being re-met by
 * every feature that opens a dialog — because "every dialog handles its own error state"
 * is a promise that holds until the first one that does not.
 *
 * WHAT THIS COMPONENT GUARANTEES
 *
 *  - A submission cannot be started twice. The guard is a ref, not the `pending` state:
 *    React batches state updates, so two clicks in the same tick both observe
 *    `pending === false` and both submit. This is the single most common duplicate-write
 *    bug in form UIs and it is invisible in manual testing, because a human cannot click
 *    twice inside one frame — but a double-tap on a phone, or an Enter key repeat, can.
 *
 *  - A failed submission leaves the dialog OPEN with the data intact. Closing on error
 *    discards what the user typed, which for a consultation note is genuinely
 *    destructive.
 *
 *  - The error is announced. `role="alert"` means a screen-reader user learns the
 *    submission failed; without it the visual user sees red text and the non-visual user
 *    sees nothing at all.
 *
 *  - Dismissal is blocked while pending. Escape, the overlay, and the close button all
 *    become inert, because closing mid-write leaves the user with no idea whether it
 *    landed.
 */

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Required, not optional. A dialog whose purpose is not stated in text is a dialog a
   * screen-reader user has to infer from its fields, and Radix warns when
   * `aria-describedby` is missing.
   */
  description: string;
  children: React.ReactNode;
  /**
   * Runs on submit. Throwing (or rejecting) surfaces the message as the dialog's error
   * and keeps the dialog open; resolving closes it.
   */
  onSubmit: () => Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in the destructive style. */
  destructive?: boolean;
  /** Disables submit for reasons the parent owns, e.g. a failing field validation. */
  submitDisabled?: boolean;
  className?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  destructive = false,
  submitDisabled = false,
  className,
}: FormDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // Synchronous double-submit guard. See the note above on why `pending` is insufficient.
  const submitting = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;

    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      await onSubmit();
      onOpenChange(false);
    } catch (cause) {
      // Keep the dialog open and the user's input intact.
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  function handleOpenChange(next: boolean) {
    // Refuse to close mid-write.
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn("sm:max-w-lg", className)}
        showCloseButton={!pending}
        onEscapeKeyDown={(event) => pending && event.preventDefault()}
        onInteractOutside={(event) => pending && event.preventDefault()}
        // Deliberately NOT setting aria-describedby here. Radix wires it to
        // DialogDescription automatically, and overriding it — even with `undefined` —
        // silently strips the dialog's description. The error is announced by its own
        // role="alert", which is the right mechanism for a message that appears later:
        // appending it to the description would make it re-read on every interaction.
      >
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">{children}</div>

          {error && (
            <p
              id={errorId}
              role="alert"
              className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending || submitDisabled}
              // aria-busy tells assistive technology the control is working. A disabled
              // button alone says "you cannot do this", not "this is in progress".
              aria-busy={pending}
            >
              {pending ? "Working…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

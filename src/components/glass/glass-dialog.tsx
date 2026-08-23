"use client";

import { FormDialog, type FormDialogProps } from "@/components/form-dialog";
import { cn } from "@/lib/utils";

/**
 * The dialog every surface should use — glass, and a bottom sheet on small screens.
 *
 * IT WRAPS `FormDialog` RATHER THAN REPLACING IT.
 *
 * `FormDialog` already carries every §23 requirement and, more importantly, the
 * behaviours that are easy to lose and hard to notice: the ref-based double-submit guard
 * (React batches state, so two clicks in one tick both see `pending === false`), keeping
 * the dialog open with input intact on failure, `role="alert"` on the error, and refusing
 * to dismiss mid-write. Re-implementing any of that to add a background would be trading
 * thirteen tested behaviours for a blur radius.
 *
 * So this is styling and layout only. `form-dialog.test.tsx` continues to cover the
 * behaviour, unchanged.
 */

/**
 * Below `sm` the dialog is anchored to the bottom of the viewport.
 *
 * A centred dialog on a phone fights the on-screen keyboard: the field being typed into
 * is pushed under it, and on iOS the whole page scrolls behind the overlay. A sheet grows
 * from the bottom edge, so the keyboard pushes it up rather than over it.
 *
 * `max-h-[85dvh]` with `overflow-y-auto` uses dynamic viewport units deliberately —
 * `vh` on mobile Safari includes the retracting toolbar, so a `85vh` sheet is taller than
 * the visible area and its confirm button sits underneath the browser chrome.
 */
const SHEET_ON_MOBILE = [
  "top-auto bottom-0 left-1/2 translate-y-0 -translate-x-1/2",
  "max-h-[85dvh] w-full max-w-full overflow-y-auto",
  "rounded-t-2xl rounded-b-none",
  "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
].join(" ");

/** From `sm` up it returns to a centred dialog. */
const DIALOG_ON_DESKTOP = [
  "sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2",
  "sm:max-h-none sm:max-w-lg sm:overflow-visible",
  "sm:rounded-xl sm:pb-6",
].join(" ");

/**
 * Level 2 in the elevation system: dialogs sit above page-level glass.
 *
 * The overlay behind it is already blurred by Radix, and this surface is the second
 * layer — which is the documented ceiling. Nothing inside a dialog may add a third
 * (`docs/UX-SPECIFICATION.md` §3), so cards within a dialog use the opaque surface only.
 */
const GLASS = [
  "border-border-glass bg-surface-glass-strong backdrop-blur-panel",
  "text-surface-foreground",
  "shadow-[0_1px_0_0_var(--glass-highlight)_inset,0_24px_48px_-24px_var(--glass-shadow)]",
].join(" ");

export type GlassDialogProps = FormDialogProps;

export function GlassDialog({ className, ...props }: GlassDialogProps) {
  return (
    <FormDialog
      {...props}
      className={cn(GLASS, SHEET_ON_MOBILE, DIALOG_ON_DESKTOP, className)}
    />
  );
}

/**
 * A destructive confirmation (B10).
 *
 * Deliberately not a generic "are you sure". The `consequence` line is required, because
 * the useful thing to tell someone is *what will happen*, not to ask whether they meant
 * it — "This ends the assignment. Their remaining scheduled activities are removed"
 * prevents a mistake that "Are you sure?" does not.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will happen, in plain words. Not a restatement of the title. */
  consequence: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <GlassDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={consequence}
      submitLabel={confirmLabel}
      cancelLabel={cancelLabel}
      destructive
      onSubmit={onConfirm}
    >
      {/*
        No body. The description carries the consequence, and Radix wires it as the
        dialog's accessible description — so a screen-reader user hears what will happen
        as part of the dialog announcement rather than having to go looking for it.
      */}
      <span className="sr-only">
        Confirming this action cannot be undone from this screen.
      </span>
    </GlassDialog>
  );
}

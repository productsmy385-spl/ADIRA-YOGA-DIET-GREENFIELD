"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  publishProgrammeAction,
  unpublishProgrammeAction,
  type ProgrammeState,
} from "../actions";

/**
 * The DRAFT → PUBLISHED → DRAFT control.
 *
 * Migration 009 introduced the lifecycle and said plainly what it was for: "a programme
 * cannot be assigned until someone deliberately publishes it". Both actions were written
 * and audited, and neither had a caller — so every programme in the product was stuck in
 * DRAFT forever, and the gate the migration describes was never reachable.
 *
 * A CLIENT component, unlike the archive control beside it, because publishing is the one
 * action here that can legitimately REFUSE: `publishProgramme` rejects an empty programme
 * inside its transaction, and that refusal is a sentence the admin needs to read. A plain
 * form action returning void would swallow it and look like a button that did nothing —
 * which is precisely the failure mode this pass exists to remove.
 */

const INITIAL: ProgrammeState = { status: "IDLE" };

export function PublishControls({
  programmeId,
  lifecycle,
  itemCount,
}: {
  programmeId: string;
  lifecycle: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  itemCount: number;
}) {
  const publishing = lifecycle !== "PUBLISHED";

  const [state, action, pending] = useActionState(
    publishing ? publishProgrammeAction : unpublishProgrammeAction,
    INITIAL,
  );

  // An archived programme cannot be published — the action says so, and offering the
  // button anyway would be a control whose only outcome is an error message.
  if (lifecycle === "ARCHIVED") {
    return (
      <p className="type-meta text-muted-foreground">
        Archived. Duplicate it to make a new editable copy.
      </p>
    );
  }

  const empty = itemCount === 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={programmeId} />
        <Button
          type="submit"
          size="sm"
          variant={publishing ? "default" : "outline"}
          disabled={pending || (publishing && empty)}
          aria-busy={pending}
        >
          {pending
            ? publishing
              ? "Publishing…"
              : "Unpublishing…"
            : publishing
              ? "Publish"
              : "Unpublish"}
        </Button>
      </form>

      {/*
        The reason the button is disabled, stated before it is pressed. The server
        enforces this too — the check that matters runs inside publishProgramme's
        transaction — but a disabled control with no explanation is its own dead end.
      */}
      {publishing && empty && (
        <p className="type-meta max-w-56 text-right text-muted-foreground">
          Add at least one item first — an empty programme would give the member a plan
          with nothing in it.
        </p>
      )}

      {state.status === "ERROR" && state.message && (
        <p role="alert" className="max-w-56 text-right text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "DONE" && state.message && (
        <p role="status" className="max-w-56 text-right text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
    </div>
  );
}

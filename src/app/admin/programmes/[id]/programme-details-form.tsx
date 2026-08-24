"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProgrammeAction, type ProgrammeState } from "../actions";
import type { Programme } from "@/server/repositories/programmes";

/** Name, description, length, difficulty. The kind is fixed at creation and not shown. */

const INITIAL: ProgrammeState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProgrammeDetailsForm({ programme }: { programme: Programme }) {
  const [state, action, pending] = useActionState(updateProgrammeAction, INITIAL);
  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="programmeId" value={programme.id} />

      {state.status === "DONE" && (
        <p className="text-sm text-foreground" role="status">
          {state.message}
        </p>
      )}
      {state.status === "ERROR" && !state.fieldErrors && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          defaultValue={programme.name}
          aria-invalid={Boolean(f.name)}
        />
        {f.name && (
          <p className="text-sm text-destructive" role="alert">
            {f.name}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={programme.description ?? ""}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="durationWeeks">Length (weeks)</Label>
          {/*
            Shortening a programme does NOT delete items beyond the new length — they stay
            in the template and simply fall outside it. Deleting on a number change would
            destroy work from a typo, and the builder shows every week that has content
            regardless, so nothing becomes invisible.
          */}
          <Input
            id="durationWeeks"
            name="durationWeeks"
            type="number"
            min={1}
            max={52}
            required
            inputMode="numeric"
            defaultValue={programme.durationWeeks}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={programme.difficulty}
            className={SELECT_CLASS}
          >
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

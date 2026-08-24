"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveYogaExerciseAction, type LibraryState } from "../library-actions";
import type { YogaExercise } from "@/server/repositories/library";

/**
 * Create or edit one yoga exercise.
 *
 * ONE FORM FOR BOTH, because the fields, the validation and the authorization are
 * identical and the only difference is whether a hidden `exerciseId` is present. Two
 * near-identical forms is how one of them silently loses a field.
 *
 * `instructions` is the field that matters most and it is not optional in spirit: it is
 * what a customer reads when their device cannot render 3D, and what a screen reader gets
 * always. The hint says so, because a consultant who thinks the animation carries the
 * instruction will write a name and stop.
 */

const INITIAL: LibraryState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export function ExerciseForm({ exercise }: { exercise?: YogaExercise }) {
  const [state, action, pending] = useActionState(saveYogaExerciseAction, INITIAL);
  const editing = Boolean(exercise);

  if (state.status === "DONE") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-4 font-medium text-card-foreground">{state.message}</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/yoga">Back to the library</Link>
          </Button>
          {!editing && (
            <Button asChild>
              <Link href="/admin/yoga/new">Add another</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {exercise && <input type="hidden" name="exerciseId" value={exercise.id} />}

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
          autoFocus={!editing}
          maxLength={200}
          defaultValue={exercise?.name}
          aria-invalid={Boolean(f.name)}
          aria-describedby={f.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={f.name} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions</Label>
        <textarea
          id="instructions"
          name="instructions"
          rows={5}
          maxLength={5000}
          defaultValue={exercise?.instructions ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-describedby="instructions-hint"
        />
        <p id="instructions-hint" className="text-sm text-muted-foreground">
          What the member should actually do. This is the guidance they read when 3D is
          unavailable, and what a screen reader reads always — so it carries the practice,
          not the animation.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="breathing">Breathing (optional)</Label>
        <Input
          id="breathing"
          name="breathing"
          maxLength={2000}
          defaultValue={exercise?.breathing ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Short description (optional)</Label>
        <Input
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={exercise?.description ?? ""}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={exercise?.difficulty ?? "BEGINNER"}
            className={SELECT_CLASS}
          >
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          {/*
            Minutes here, seconds in the database. A consultant prescribes "five minutes",
            and making them type 300 is the kind of friction that produces 30-second poses
            by accident.
          */}
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            max={180}
            inputMode="numeric"
            defaultValue={
              exercise?.defaultDurationSeconds
                ? Math.round(exercise.defaultDurationSeconds / 60)
                : ""
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="repetitions">Repetitions</Label>
          <Input
            id="repetitions"
            name="repetitions"
            type="number"
            min={0}
            max={500}
            inputMode="numeric"
            defaultValue={exercise?.defaultRepetitions ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add to library"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/yoga">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

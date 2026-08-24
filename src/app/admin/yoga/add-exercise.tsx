"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createExerciseAction, type LibraryState } from "./actions";

/**
 * Add an exercise to the library.
 *
 * A disclosure rather than a separate route: an admin building a library adds several in a
 * row, and a page navigation between each one is friction for no benefit. The form closes
 * itself on success so the new row is visible immediately.
 *
 * Duration is asked in MINUTES. The column stores seconds, and the action converts —
 * consultants think in minutes and a field labelled "seconds" invites a wrong answer.
 */

const INITIAL: LibraryState = { status: "IDLE" };

const DIFFICULTIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add exercise"}
    </Button>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

const textareaClass =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export function AddExerciseForm() {
  const [state, action] = useActionState(createExerciseAction, INITIAL);
  const [open, setOpen] = useState(false);

  // Collapse once the write succeeds, so the list below is what the admin sees next.
  if (state.status === "DONE" && open) setOpen(false);

  const f = state.fields ?? {};

  if (!open) {
    return (
      <div className="mt-6 space-y-3">
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus aria-hidden />
          Add exercise
        </Button>

        {state.status === "DONE" && state.message ? (
          <Alert>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-5 rounded-xl border border-border bg-card p-6">
      <h2 className="font-medium text-card-foreground">New exercise</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoFocus aria-invalid={Boolean(f.name)} />
          {f.name ? (
            <p className="text-sm text-destructive" role="alert">
              {f.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select id="difficulty" name="difficulty" defaultValue="BEGINNER" className={selectClass}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="breathing">
            Breathing <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="breathing" name="breathing" placeholder="e.g. inhale 4, exhale 6" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationMinutes">
            Duration in minutes <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="repetitions">
            Repetitions <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="repetitions"
            name="repetitions"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">
            Description <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea id="description" name="description" rows={2} className={textareaClass} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="instructions">
            Instructions <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea id="instructions" name="instructions" rows={3} className={textareaClass} />
          <p className="text-xs text-muted-foreground">
            What the member should actually do. This is shown to them during practice, so
            write it as guidance rather than as a clinical instruction.
          </p>
        </div>
      </div>

      {state.status === "ERROR" && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Submit />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

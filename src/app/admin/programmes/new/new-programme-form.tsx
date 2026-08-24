"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProgrammeAction, type ProgrammeState } from "../actions";

/**
 * The programme shell.
 *
 * On success the action REDIRECTS into the builder rather than returning a message, so
 * there is no success branch here — an empty programme is not usable, and leaving the admin
 * on a "created!" screen makes them go and find it before they can add anything.
 */

const INITIAL: ProgrammeState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function NewProgrammeForm({ defaultKind }: { defaultKind: "YOGA" | "DIET" }) {
  const [state, action, pending] = useActionState(createProgrammeAction, INITIAL);
  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {state.status === "ERROR" && !state.fieldErrors && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="kind">Kind</Label>
        <select id="kind" name="kind" defaultValue={defaultKind} className={SELECT_CLASS}>
          <option value="YOGA">Yoga programme</option>
          <option value="DIET">Diet plan</option>
        </select>
        <p className="text-sm text-muted-foreground">
          This cannot be changed later — a yoga programme holds exercises, a diet plan holds
          meals.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          maxLength={200}
          aria-invalid={Boolean(f.name)}
          aria-describedby={f.name ? "name-error" : undefined}
        />
        {f.name && (
          <p id="name-error" className="text-sm text-destructive" role="alert">
            {f.name}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" name="description" maxLength={2000} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="durationWeeks">Length (weeks)</Label>
          <Input
            id="durationWeeks"
            name="durationWeeks"
            type="number"
            min={1}
            max={52}
            defaultValue={4}
            inputMode="numeric"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <select id="difficulty" name="difficulty" defaultValue="BEGINNER" className={SELECT_CLASS}>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create and add items"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/programmes">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

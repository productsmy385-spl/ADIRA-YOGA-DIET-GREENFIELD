"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMealAction, type LibraryState } from "../library-actions";
import type { Meal } from "@/server/repositories/library";

/**
 * Create or edit one meal.
 *
 * `quantity` is FREE TEXT, deliberately. Consultants here prescribe "one bowl", "two
 * rotis", "a handful" — not grams. A numeric field with a unit dropdown would be more
 * structured and less true, and it would push people into rounding real advice into fake
 * precision.
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

export function MealForm({ meal }: { meal?: Meal }) {
  const [state, action, pending] = useActionState(saveMealAction, INITIAL);
  const editing = Boolean(meal);

  if (state.status === "DONE") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-4 font-medium text-card-foreground">{state.message}</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/diet">Back to the library</Link>
          </Button>
          {!editing && (
            <Button asChild>
              <Link href="/admin/diet/new">Add another</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  const f = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5">
      {meal && <input type="hidden" name="mealId" value={meal.id} />}

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
          defaultValue={meal?.name}
          aria-invalid={Boolean(f.name)}
          aria-describedby={f.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={f.name} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="slot">Meal</Label>
          <select
            id="slot"
            name="slot"
            defaultValue={meal?.slot ?? ""}
            className={SELECT_CLASS}
          >
            {/* Blank is legitimate: a snack idea that suits any time of day should not be
                forced into a slot it does not belong to. */}
            <option value="">Any time</option>
            <option value="BREAKFAST">Breakfast</option>
            <option value="LUNCH">Lunch</option>
            <option value="SNACK">Snack</option>
            <option value="DINNER">Dinner</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            maxLength={200}
            placeholder="one bowl"
            defaultValue={meal?.quantity ?? ""}
            aria-describedby="quantity-hint"
          />
          <p id="quantity-hint" className="text-sm text-muted-foreground">
            In your own words — &ldquo;two rotis&rdquo;, not grams.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions (optional)</Label>
        <textarea
          id="instructions"
          name="instructions"
          rows={4}
          maxLength={5000}
          defaultValue={meal?.instructions ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Short description (optional)</Label>
        <Input
          id="description"
          name="description"
          maxLength={2000}
          defaultValue={meal?.description ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (optional)</Label>
        <Input
          id="tags"
          name="tags"
          maxLength={500}
          placeholder="vegetarian, high-protein"
          defaultValue={meal?.tags?.join(", ") ?? ""}
          aria-describedby="tags-hint"
        />
        <p id="tags-hint" className="text-sm text-muted-foreground">
          Separated by commas. Used to find meals when building a plan.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add to library"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/diet">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

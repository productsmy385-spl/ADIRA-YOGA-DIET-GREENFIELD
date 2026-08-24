"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMealAction, type LibraryState } from "./actions";

/**
 * Add a meal to the library.
 *
 * Quantity is free text on purpose — "one bowl", "two rotis". A numeric grams field would
 * make the answer a consultant actually gives unrepresentable, and the schema agrees.
 *
 * There are deliberately no calorie or macronutrient fields. The product does not hold
 * that data, and inventing inputs for it would either sit empty or invite someone to
 * estimate numbers that then look authoritative on a member's plan.
 */

const INITIAL: LibraryState = { status: "IDLE" };

const SLOTS = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add meal"}
    </Button>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

const textareaClass =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm";

export function AddMealForm() {
  const [state, action] = useActionState(createMealAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (state.status === "DONE" && open) setOpen(false);

  const f = state.fields ?? {};

  if (!open) {
    return (
      <div className="mt-6 space-y-3">
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus aria-hidden />
          Add meal
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
      <h2 className="font-medium text-card-foreground">New meal</h2>

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
          <Label htmlFor="slot">
            Meal slot <span className="text-muted-foreground">(optional)</span>
          </Label>
          <select id="slot" name="slot" defaultValue="" className={selectClass}>
            <option value="">Any time</option>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          {f.slot ? (
            <p className="text-sm text-destructive" role="alert">
              {f.slot}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">
            Quantity <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="quantity" name="quantity" placeholder="one bowl, two rotis" />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="tags">
            Tags <span className="text-muted-foreground">(optional, comma separated)</span>
          </Label>
          <Input id="tags" name="tags" placeholder="vegetarian, high protein, light" />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">
            Description <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea id="description" name="description" rows={2} className={textareaClass} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="instructions">
            Preparation <span className="text-muted-foreground">(optional)</span>
          </Label>
          <textarea id="instructions" name="instructions" rows={3} className={textareaClass} />
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

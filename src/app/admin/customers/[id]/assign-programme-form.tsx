"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignProgrammeAction, type AssignState } from "./actions";

/**
 * Prescribe a programme to this member.
 *
 * Yoga and diet plans are the same table with a different `kind`, so this one form covers
 * both — the select simply lists whichever templates the organisation has. Assigning a
 * yoga plan and a diet plan is two uses of this form, not two forms.
 *
 * START IT NOW is a checkbox, defaulted ON. Activation is what generates the daily
 * activities, and a plan nobody started is one the member cannot see — the common
 * intention is "give them this, starting today", so that is the default. Leaving it off
 * produces a DRAFT, which is the deliberate choice rather than the accidental one.
 */

const INITIAL: AssignState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface ProgrammeOption {
  id: string;
  name: string;
  kind: "YOGA" | "DIET";
  durationWeeks: number;
  itemCount: number;
}

export function AssignProgrammeForm({
  customerId,
  today,
  programmes,
}: {
  customerId: string;
  /** The organisation's today, so the date input cannot offer a past start. */
  today: string;
  programmes: ProgrammeOption[];
}) {
  const [state, action, pending] = useActionState(assignProgrammeAction, INITIAL);
  const [selected, setSelected] = useState<ProgrammeOption | null>(null);

  /*
   * An empty template can be assigned by the database but prescribes nothing, so it is
   * excluded rather than offered with a warning. A consultant who picks it gets a member
   * with a plan and no sessions, and no error anywhere.
   */
  const assignable = programmes.filter((p) => p.itemCount > 0);

  if (assignable.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No programme is ready to assign yet. A programme needs at least one exercise or
          meal in it, and must be published, before it can be given to somebody.
        </p>
        {/* An empty state that leads somewhere. The reason this list is empty is almost
            always "nothing has been published", and the fix is one page away. */}
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/programmes">Go to programmes</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customerId" value={customerId} />

      {state.status === "DONE" && (
        <p className="text-sm text-foreground" role="status">
          {state.message}
        </p>
      )}
      {state.status === "ERROR" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="programmeId">Programme</Label>
        <select
          id="programmeId"
          name="programmeId"
          required
          className={SELECT_CLASS}
          onChange={(event) =>
            setSelected(assignable.find((p) => p.id === event.target.value) ?? null)
          }
        >
          <option value="">Choose a programme…</option>
          {assignable.map((programme) => (
            <option key={programme.id} value={programme.id}>
              {programme.kind === "YOGA" ? "Yoga" : "Diet"} — {programme.name} (
              {programme.durationWeeks}w, {programme.itemCount} items)
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startsOn">Starts on</Label>
          <Input
            id="startsOn"
            name="startsOn"
            type="date"
            required
            defaultValue={today}
            min={today}
            aria-describedby="starts-hint"
          />
          <p id="starts-hint" className="type-meta text-muted-foreground">
            Sessions are scheduled from this date. It cannot be in the past.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="durationWeeks">Length (weeks)</Label>
          <Input
            id="durationWeeks"
            name="durationWeeks"
            type="number"
            min={1}
            max={52}
            inputMode="numeric"
            key={`weeks-${selected?.id ?? "none"}`}
            defaultValue={selected?.durationWeeks ?? ""}
            placeholder={selected ? String(selected.durationWeeks) : "From the template"}
            aria-describedby="weeks-hint"
          />
          <p id="weeks-hint" className="type-meta text-muted-foreground">
            Defaults to the template&rsquo;s own length. Shorten it for a trial run.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        <input
          id="activate"
          name="activate"
          type="checkbox"
          defaultChecked
          className="mt-0.5 size-4 rounded border-input"
        />
        <div>
          <Label htmlFor="activate">Start it now</Label>
          <p className="type-meta text-muted-foreground">
            Schedules the sessions and makes the plan visible to the member. Leave this off
            to save it as a draft.
          </p>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Assigning…" : "Assign plan"}
      </Button>

      {/*
        ADR-009, said where the decision is made. The snapshot is what makes it safe to
        keep editing templates, and a consultant who does not know that will hesitate to
        do either.
      */}
      <p className="type-meta text-muted-foreground">
        The member receives a copy of the programme as it is now. Editing the template later
        will not change their plan.
      </p>
    </form>
  );
}

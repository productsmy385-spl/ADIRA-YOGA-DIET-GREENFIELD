"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addProgrammeItemAction, type ProgrammeState } from "../actions";

/**
 * Put one exercise or meal at one position.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY WEEK AND DAY ARE STICKY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A consultant fills a day at a time — five exercises into week 2 Tuesday, then moves on.
 * Resetting the position after every add would make them re-choose it five times, and the
 * fifth time they would get it wrong. So the position is component state that PERSISTS
 * across submissions, while the selection resets.
 *
 * `sequence` is deliberately not offered. The repository computes the next free slot inside
 * the insert transaction, which is both correct under concurrency and one less decision
 * for the person doing the work. Order within a day is the order things were added.
 */

const INITIAL: ProgrammeState = { status: "IDLE" };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const DAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

export interface ExerciseOption {
  id: string;
  name: string;
  defaultDurationSeconds: number | null;
  defaultRepetitions: number | null;
}

export interface MealOption {
  id: string;
  name: string;
  slot: string | null;
}

export function AddItemForm({
  programmeId,
  durationWeeks,
  kind,
  exercises,
  meals,
}: {
  programmeId: string;
  durationWeeks: number;
  kind: "YOGA" | "DIET";
  exercises: ExerciseOption[];
  meals: MealOption[];
}) {
  const [state, action, pending] = useActionState(addProgrammeItemAction, INITIAL);

  // Sticky position — see the header.
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState<number>(1);

  // Prefill duration and repetitions from the library's defaults when an exercise is
  // chosen, so the common case is zero extra typing and the unusual case is an override.
  const [selectedExercise, setSelectedExercise] = useState<ExerciseOption | null>(null);

  const isYoga = kind === "YOGA";

  const weeks = Array.from({ length: durationWeeks }, (_, index) => index + 1);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="programmeId" value={programmeId} />

      {state.status === "DONE" && (
        <p className="text-sm text-foreground" role="status">
          Added to week {week}, {DAYS.find(([value]) => value === day)?.[1]}.
        </p>
      )}
      {state.status === "ERROR" && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weekNumber">Week</Label>
          <select
            id="weekNumber"
            name="weekNumber"
            value={week}
            onChange={(event) => setWeek(Number(event.target.value))}
            className={SELECT_CLASS}
          >
            {weeks.map((value) => (
              <option key={value} value={value}>
                Week {value}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dayOfWeek">Day</Label>
          <select
            id="dayOfWeek"
            name="dayOfWeek"
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
            className={SELECT_CLASS}
          >
            {DAYS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isYoga ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="yogaExerciseId">Exercise</Label>
            <select
              id="yogaExerciseId"
              name="yogaExerciseId"
              required
              className={SELECT_CLASS}
              onChange={(event) =>
                setSelectedExercise(
                  exercises.find((e) => e.id === event.target.value) ?? null,
                )
              }
            >
              <option value="">Choose an exercise…</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="durationMinutes">Duration (minutes)</Label>
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={0}
                max={180}
                inputMode="numeric"
                // `key` forces the browser to take the new defaultValue when the selection
                // changes; without it React keeps the previously rendered value.
                key={`duration-${selectedExercise?.id ?? "none"}`}
                defaultValue={
                  selectedExercise?.defaultDurationSeconds
                    ? Math.round(selectedExercise.defaultDurationSeconds / 60)
                    : ""
                }
                aria-describedby="duration-hint"
              />
              <p id="duration-hint" className="type-meta text-muted-foreground">
                Prefilled from the library. Override it for this programme if needed.
              </p>
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
                key={`reps-${selectedExercise?.id ?? "none"}`}
                defaultValue={selectedExercise?.defaultRepetitions ?? ""}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="mealId">Meal</Label>
            <select id="mealId" name="mealId" required className={SELECT_CLASS}>
              <option value="">Choose a meal…</option>
              {meals.map((meal) => (
                <option key={meal.id} value={meal.id}>
                  {meal.name}
                  {meal.slot ? ` — ${meal.slot.toLowerCase()}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot">Time of day</Label>
            <select id="slot" name="slot" defaultValue="" className={SELECT_CLASS}>
              <option value="">Use the meal&rsquo;s own setting</option>
              <option value="BREAKFAST">Breakfast</option>
              <option value="SNACK">Snack — morning or evening</option>
              <option value="LUNCH">Lunch</option>
              <option value="DINNER">Dinner</option>
            </select>
            <p className="type-meta text-muted-foreground">
              {/*
                The schema's meal_slot enum has four values, so "morning snack" and
                "evening snack" are both SNACK plus a position within the day. Saying so
                is better than implying a distinction the data cannot hold.
              */}
              Morning and evening snacks are both &ldquo;snack&rdquo; — their order within
              the day is what separates them.
            </p>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Note for this position (optional)</Label>
        <Input id="notes" name="notes" maxLength={2000} key={`notes-${state.status}`} />
      </div>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : `Add to week ${week}`}
      </Button>
    </form>
  );
}

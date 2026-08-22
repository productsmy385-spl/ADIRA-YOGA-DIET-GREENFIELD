"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { CheckIn } from "@/server/repositories/checkins";

import { saveCheckInAction } from "./actions";

/**
 * The daily check-in (§17).
 *
 * J1 gives this under 30 seconds. A long check-in gets skipped, and a skipped check-in
 * is missing data — so this is four taps and an optional note, not a questionnaire.
 *
 * Mood and sleep are five bands rather than free numbers. Self-reported wellbeing does
 * not carry more precision than that, and offering a 1–100 slider would imply it does.
 * The bands are labelled, because "3" means nothing on its own to the person choosing it
 * or to the consultant reading it later.
 */

const MOOD_LABELS = ["Very low", "Low", "Okay", "Good", "Very good"] as const;
const SLEEP_LABELS = ["Very poor", "Poor", "Okay", "Good", "Very good"] as const;

function Scale({
  name,
  legend,
  labels,
  value,
  onChange,
  disabled,
}: {
  name: string;
  legend: string;
  labels: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {/* A radio group, not buttons: arrow-key navigation and single-selection semantics
          come free and correct, and a screen reader announces "3 of 5". */}
      <div className="mt-2 flex gap-2">
        {labels.map((label, index) => {
          const band = index + 1;
          const selected = value === band;
          return (
            <label
              key={band}
              title={label}
              className={`flex-1 cursor-pointer rounded-md border px-2 py-2 text-center text-xs transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={band}
                checked={selected}
                onChange={() => onChange(band)}
                className="sr-only"
              />
              <span aria-hidden>{band}</span>
              <span className="sr-only">{label}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {value === null ? "Not answered" : labels[value - 1]}
      </p>
    </fieldset>
  );
}

export function CheckInForm({ existing }: { existing: CheckIn | null }) {
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [sleep, setSleep] = useState<number | null>(existing?.sleepQuality ?? null);
  const [water, setWater] = useState<number>(existing?.waterGlasses ?? 0);
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveCheckInAction({
        mood,
        sleepQuality: sleep,
        waterGlasses: water,
        notes: notes.trim() || null,
      });
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="grid gap-5">
        <Scale
          name="mood"
          legend="How do you feel today?"
          labels={MOOD_LABELS}
          value={mood}
          onChange={setMood}
          disabled={pending}
        />

        <Scale
          name="sleep"
          legend="How did you sleep?"
          labels={SLEEP_LABELS}
          value={sleep}
          onChange={setSleep}
          disabled={pending}
        />

        <div>
          <label htmlFor="water" className="text-sm font-medium text-foreground">
            Water today
          </label>
          <div className="mt-2 flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setWater((n) => Math.max(0, n - 1))}
              disabled={pending || water === 0}
              aria-label="One glass fewer"
            >
              −
            </Button>
            <output
              id="water"
              className="min-w-16 text-center text-sm text-foreground"
              aria-live="polite"
            >
              {water} {water === 1 ? "glass" : "glasses"}
            </output>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setWater((n) => Math.min(50, n + 1))}
              disabled={pending || water >= 50}
              aria-label="One glass more"
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="text-sm font-medium text-foreground">
            Anything to add?
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={pending}
            placeholder="Optional — your consultant will see this."
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending} aria-busy={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            {existing ? "Update check-in" : "Save check-in"}
          </Button>

          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Saved.
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

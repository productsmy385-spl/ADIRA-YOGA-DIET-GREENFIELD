"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { scheduleSessionAction, type SessionFormState } from "./actions";

const SELECT = "mt-1.5 h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm";

export function ScheduleSessionForm({
  instructors,
  chooseInstructor,
}: {
  instructors: Array<{ id: string; fullName: string }>;
  /** Only an ADMIN names someone else; a trainer schedules their own sessions. */
  chooseInstructor: boolean;
}) {
  const [state, action, pending] = useActionState<SessionFormState, FormData>(scheduleSessionAction, {});

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="title">Session name</Label>
        <Input id="title" name="title" required maxLength={120} placeholder="Morning Hatha" className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" required className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="time">Start time</Label>
        <Input id="time" name="time" type="time" required className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="durationMinutes">Length (minutes)</Label>
        <Input id="durationMinutes" name="durationMinutes" type="number" min={5} max={480} defaultValue={60} required className="mt-1.5" />
      </div>
      {chooseInstructor ? (
        <div>
          <Label htmlFor="instructorId">Instructor</Label>
          <select id="instructorId" name="instructorId" required className={SELECT}>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea id="notes" name="notes" rows={2} maxLength={2000} className="mt-1.5 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
      </div>
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule session"}
        </Button>
      </div>
    </form>
  );
}

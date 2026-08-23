"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccessAction, type RequestAccessState } from "./actions";

/**
 * The public access-request form.
 *
 * Form actions rather than fetch, so it works before hydration — this is the first thing a
 * prospective member ever loads, often on a slow connection, and a form that needs
 * JavaScript to submit is a form some people simply cannot use.
 *
 * There is no organisation picker and no role selector. Neither is missing by oversight:
 * a picker would publish the tenant list, and a role selector would invite the applicant
 * to ask for one (ADR-013).
 */

const INITIAL: RequestAccessState = { status: "IDLE" };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Sending…" : "Request access"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export function RequestAccessForm() {
  const [state, action] = useActionState(requestAccessAction, INITIAL);

  if (state.status === "SUBMITTED") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-4 font-medium text-card-foreground">Request received</h2>
        <p className="mt-2 text-sm/relaxed text-muted-foreground">
          If the code is valid, an administrator at your organisation will review your
          request. You&rsquo;ll receive an email when they decide.
        </p>
      </div>
    );
  }

  const f = state.fields ?? {};
  const v = state.values;

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="joinCode">Organisation code</Label>
        <Input
          id="joinCode"
          name="joinCode"
          required
          autoFocus
          defaultValue={v?.joinCode}
          placeholder="ADIRA-XXXX"
          aria-invalid={Boolean(f.joinCode)}
          aria-describedby={f.joinCode ? "joinCode-error" : "joinCode-hint"}
          className="font-mono"
        />
        {f.joinCode ? (
          <span id="joinCode-error">
            <FieldError message={f.joinCode} />
          </span>
        ) : (
          <p id="joinCode-hint" className="text-sm text-muted-foreground">
            Your organisation gives you this code. It is not published anywhere.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          autoComplete="name"
          defaultValue={v?.fullName}
          aria-invalid={Boolean(f.fullName)}
        />
        <FieldError message={f.fullName} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={v?.email}
          aria-invalid={Boolean(f.email)}
        />
        <FieldError message={f.email} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          Phone <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          defaultValue={v?.phone}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">
          Why are you requesting access?{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          maxLength={2000}
          defaultValue={v?.reason}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        />
        <FieldError message={f.reason} />
      </div>

      {state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton />

      <p className="text-center text-xs/relaxed text-muted-foreground">
        Requesting access does not create an account. An administrator decides, and you
        confirm your email address before you can sign in.
      </p>
    </form>
  );
}

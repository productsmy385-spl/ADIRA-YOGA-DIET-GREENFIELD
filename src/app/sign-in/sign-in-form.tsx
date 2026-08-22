"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chooseOrganizationAction,
  requestCodeAction,
  verifyCodeAction,
  type SignInState,
} from "./actions";

/**
 * The sign-in form.
 *
 * One component holding three steps rather than three routes, because the steps share
 * state that must not be in the URL: putting the email in a query string would write it
 * into browser history, server logs, and any Referer header the page emits.
 *
 * Progressive enhancement is real here — these are form actions, so the flow works before
 * hydration. That matters for a customer on a slow connection, which is a substantial
 * part of who this product is for.
 */

const INITIAL: SignInState = { step: "EMAIL" };

function SubmitButton({ children }: { children: React.ReactNode }) {
  // `useFormStatus` must be read from a child of the form, not the component that owns
  // it — the hook reports the status of the nearest enclosing form.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(requestCodeAction, INITIAL);
  const [codeState, codeAction] = useActionState(verifyCodeAction, INITIAL);
  const [chooseState, chooseAction] = useActionState(chooseOrganizationAction, INITIAL);

  // The furthest-advanced step wins. Each action returns its own state, so the flow is
  // driven by whichever one last reported progress.
  const current =
    chooseState.step === "CHOOSE" || chooseState.error
      ? chooseState
      : codeState.step !== "EMAIL" || codeState.error
        ? codeState
        : state;

  const email = current.email ?? state.email ?? "";

  if (current.step === "CHOOSE" && current.memberships) {
    return (
      <form action={chooseAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />

        <div>
          <h2 className="text-sm font-medium text-foreground">Choose an organisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This address belongs to more than one.
          </p>
        </div>

        <div className="space-y-2">
          {current.memberships.map((membership) => (
            <button
              key={membership.organizationId}
              type="submit"
              name="organizationId"
              value={membership.organizationId}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="font-medium text-card-foreground">
                {membership.organizationName}
              </span>
              <span className="text-xs text-muted-foreground">{membership.role}</span>
            </button>
          ))}
        </div>

        {current.error ? (
          <Alert variant="destructive">
            <AlertDescription>{current.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    );
  }

  if (current.step === "CODE") {
    return (
      <form action={codeAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />

        <div className="space-y-2">
          <Label htmlFor="code">Six-digit code</Label>
          <Input
            id="code"
            name="code"
            // `inputMode` and `autoComplete` together are what make a phone show a number
            // pad and offer the code straight from the SMS/email notification.
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em]"
          />
          {current.notice ? (
            <p className="text-sm text-muted-foreground">{current.notice}</p>
          ) : null}
        </div>

        {current.error ? (
          <Alert variant="destructive">
            <AlertDescription>{current.error}</AlertDescription>
          </Alert>
        ) : null}

        <SubmitButton>Verify and sign in</SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          Sent to <span className="text-foreground">{email}</span>
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={email}
          placeholder="you@example.com"
        />
      </div>

      {current.error ? (
        <Alert variant="destructive">
          <AlertDescription>{current.error}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton>Send me a code</SubmitButton>
    </form>
  );
}

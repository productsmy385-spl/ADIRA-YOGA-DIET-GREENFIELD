"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestOwnerCodeAction,
  verifyOwnerCodeAction,
  type OwnerSignInState,
} from "./actions";

/**
 * Platform sign-in. Email, then code.
 *
 * No passkey button here yet: passkey enrolment for platform accounts exists in the
 * schema but has no surface, and offering a control that cannot work is worse than
 * offering one path that does.
 */

const INITIAL: OwnerSignInState = { step: "EMAIL" };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

export function OwnerSignInForm() {
  const [emailState, requestCode] = useActionState(requestOwnerCodeAction, INITIAL);
  const [codeState, verifyCode] = useActionState(verifyOwnerCodeAction, INITIAL);

  const current = codeState.step !== "EMAIL" || codeState.error ? codeState : emailState;
  const email = current.email ?? emailState.email ?? "";

  if (current.step === "CODE") {
    return (
      <form action={verifyCode} className="space-y-4">
        <input type="hidden" name="email" value={email} />

        <div className="space-y-2">
          <Label htmlFor="code">Six-digit code</Label>
          <Input
            id="code"
            name="code"
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
    <form action={requestCode} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Platform account email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={email}
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

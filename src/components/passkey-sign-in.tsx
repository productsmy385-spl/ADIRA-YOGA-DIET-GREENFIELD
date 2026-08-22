"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/**
 * Passkey sign-in and enrolment.
 *
 * Both ceremonies are two round trips: ask the server to begin, hand the options to the
 * browser's WebAuthn API, post the result back. The server owns every decision; this
 * component only carries bytes between the authenticator and the API.
 *
 * The component renders nothing at all where WebAuthn is unavailable. Showing a button
 * that cannot work — on an older browser, or in an embedded webview, both of which real
 * customers will use — produces an error the person cannot act on. OTP remains the path
 * for them, and it is already on the page.
 */

type Status = "idle" | "working" | "error";

/** Capability check, so it never changes after load and nothing needs to subscribe. */
const noSubscription = () => () => {};

function useWebAuthnSupport(): boolean {
  // `browserSupportsWebAuthn` needs `window`, so the server has no answer. Reading it
  // through useSyncExternalStore rather than copying it into state via an effect means
  // the server renders "unsupported", React re-reads after hydration, and there is no
  // frame where a button appears and then vanishes.
  return useSyncExternalStore(
    noSubscription,
    () => browserSupportsWebAuthn(),
    () => false,
  );
}

/** Human wording for the small number of failures a person can actually act on. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    // Thrown when the user dismisses the platform prompt, and also on a timeout. Not an
    // error worth alarming anyone about.
    if (error.name === "NotAllowedError") {
      return "That was cancelled. You can try again, or use a code instead.";
    }
    if (error.name === "InvalidStateError") {
      return "This device already has a passkey for your account.";
    }
  }
  return "Could not use a passkey. You can sign in with a code instead.";
}

export function PasskeySignInButton({
  className,
  /**
   * Render an "or use a code" divider beneath the button.
   *
   * It belongs to this component rather than to the page because the whole component
   * removes itself where WebAuthn is unavailable. A divider owned by the page would
   * survive that removal and announce an alternative to nothing.
   */
  withDivider = false,
}: {
  className?: string;
  withDivider?: boolean;
}) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    setStatus("working");
    setMessage(null);

    try {
      const beginResponse = await fetch("/api/auth/passkey/authenticate/begin", {
        method: "POST",
      });
      if (!beginResponse.ok) throw new Error("begin failed");
      const { challengeId, options } = await beginResponse.json();

      // Hands off to the platform authenticator. This is the call that shows Face ID,
      // Touch ID, or Windows Hello, and it rejects if the person dismisses it.
      const assertion = await startAuthentication({ optionsJSON: options });

      const completeResponse = await fetch("/api/auth/passkey/authenticate/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, response: assertion }),
      });

      if (!completeResponse.ok) {
        setStatus("error");
        setMessage(
          completeResponse.status === 429
            ? "Too many attempts. Please wait a moment."
            : "Could not sign you in with that passkey.",
        );
        return;
      }

      const { domain } = await completeResponse.json();
      // The session cookie is set by the response; a refresh is what makes the server
      // components see it.
      router.replace(domain === "PLATFORM" ? "/owner" : "/dashboard");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(describe(error));
    }
  }

  if (!supported) return null;

  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={signIn}
        disabled={status === "working"}
        aria-busy={status === "working"}
      >
        <KeyRound className="size-4" aria-hidden />
        {status === "working" ? "Waiting for your device…" : "Sign in with a passkey"}
      </Button>

      {message && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {message}
        </p>
      )}

      {withDivider && (
        <div className="mt-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or use a code</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </div>
  );
}

export function PasskeyEnrolButton({ className }: { className?: string }) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function enrol() {
    setStatus("working");
    setMessage(null);

    try {
      const beginResponse = await fetch("/api/auth/passkey/register/begin", {
        method: "POST",
      });
      if (!beginResponse.ok) throw new Error("begin failed");
      const { challengeId, options } = await beginResponse.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const completeResponse = await fetch("/api/auth/passkey/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, response: attestation }),
      });

      if (!completeResponse.ok) {
        setStatus("error");
        setMessage("Could not register this device.");
        return;
      }

      setStatus("idle");
      setMessage(null);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(describe(error));
    }
  }

  if (!supported) return null;

  return (
    <div className={className}>
      <Button
        type="button"
        onClick={enrol}
        disabled={status === "working"}
        aria-busy={status === "working"}
      >
        <KeyRound className="size-4" aria-hidden />
        {status === "working" ? "Waiting for your device…" : "Add a passkey"}
      </Button>

      {message && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

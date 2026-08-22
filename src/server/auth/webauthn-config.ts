/**
 * WebAuthn relying-party configuration, derived from APP_URL.
 *
 * The RP ID and the expected origin are the two values that make a passkey assertion
 * meaningful. An authenticator scopes its credentials to the RP ID, and the browser
 * refuses to use a credential registered for one origin on another — so getting these
 * wrong does not weaken security, it breaks sign-in entirely, usually with a message
 * that does not point back here.
 *
 * Kept pure and separate from the ceremony code so the derivation can be tested without
 * a database, a request, or an authenticator.
 */

/**
 * The relying-party id is the registrable domain, WITHOUT scheme or port.
 *
 * `https://adira.example:3000` → `adira.example`
 *
 * Port is excluded because WebAuthn scopes credentials by domain, not by origin — a
 * passkey registered on :3000 must still work on :443. Including the port produces
 * credentials that silently stop resolving the moment the port changes.
 */
export function relyingPartyIdFrom(appUrl: string): string {
  return new URL(appUrl).hostname;
}

/**
 * The expected origin, WITH scheme and port.
 *
 * This one is the full origin, because the browser sends the exact origin it used and
 * the library compares them literally. `new URL(...).origin` normalises away a trailing
 * slash and a default port, which is what makes it safe to feed a hand-edited APP_URL.
 */
export function expectedOriginFrom(appUrl: string): string {
  return new URL(appUrl).origin;
}

export interface WebauthnConfig {
  readonly rpId: string;
  readonly rpName: string;
  readonly expectedOrigin: string;
}

export function webauthnConfigFrom(appUrl: string, rpName: string): WebauthnConfig {
  return {
    rpId: relyingPartyIdFrom(appUrl),
    rpName,
    expectedOrigin: expectedOriginFrom(appUrl),
  };
}

/** How long a ceremony may stay open. */
export const CHALLENGE_TTL_MS = 5 * 60_000;

/**
 * Registration options that are policy rather than plumbing.
 *
 * `userVerification: "preferred"` rather than `"required"`: requiring it rejects
 * authenticators that cannot do a PIN or biometric, and this product's customers include
 * people on older Android devices. Preferred still gets the second factor everywhere it
 * is available.
 *
 * `residentKey: "preferred"` enables the discoverable-credential flow — the user clicks
 * Sign in and picks a passkey without typing an address first. That is the experience
 * worth having for someone opening the app at 5am, and it is why the challenge table
 * allows a null principal.
 */
export const REGISTRATION_POLICY = {
  userVerification: "preferred",
  residentKey: "preferred",
  /**
   * Exclude nothing by default; the caller passes the user's existing credentials so
   * the authenticator can refuse to register the same device twice.
   */
  attestationType: "none",
} as const;

/**
 * Attestation is deliberately "none".
 *
 * Requesting attestation would let us verify the authenticator's make and model, and it
 * would also mean receiving a hardware identifier for every customer's device — data we
 * have no use for and would then be responsible for holding. For a wellness product
 * there is no threat model that justifies it.
 */

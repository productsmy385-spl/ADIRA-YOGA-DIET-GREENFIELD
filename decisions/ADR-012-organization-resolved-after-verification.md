# ADR-012 — The organization is resolved *after* the credential verifies, never before

**Decision:** Sign-in never asks which organization you belong to, and never reveals it
before a credential has verified. Passkey sign-in resolves the tenant from the credential
itself. OTP sign-in collects only an address; when that address has accounts in more than
one organization, the choice is offered **after** the code is verified.

**Status:** Accepted

**Date:** 2026-08-22

---

## Why

`users_email_unique_per_org` makes email unique per organization rather than globally,
deliberately: the same person can be a customer at one studio and a consultant at another,
and a global constraint would make the second relationship unrepresentable
(`migrations/001_foundation.sql`).

That design has a consequence the authentication document never addressed. At sign-in
there is no session yet, so there is nothing to say *which* organization an address means.
Something has to resolve it, and every obvious answer leaks.

**An organization picker on the sign-in form** publishes the tenant list. Anyone can read
which wellness studios use Adira. `organizations.join_code` exists precisely so that
signup targets a tenant by out-of-band code rather than by choosing from a public list —
a picker on the sign-in page would hand back exactly what that column was designed to
withhold.

**Asking for the organization slug first** turns the form into an oracle: submit an
address against a slug and see whether the response differs. That confirms both that the
studio exists and that the person is a member of it.

**Resolving before verification and reporting "you have accounts at 2 studios"** is the
same leak with extra steps. Anyone who can type an address learns where its owner receives
therapy — which, for a health product, is the disclosure that matters most.

The rule in `docs/AUTHENTICATION.md` already covers this without naming it: unknown
address and wrong credential produce the same response, and account state is revealed only
*after* the credential verifies. Organization membership is account state.

## Alternatives considered

**Subdomain per tenant** (`studio.adira.app`). Resolves the organization from the host
with no leak on the sign-in form itself, and is the conventional answer. Rejected for now:
it needs wildcard DNS, wildcard TLS, and a host-to-tenant lookup on every request, and it
makes `APP_URL` — which WebAuthn derives its relying-party id from — vary per tenant. That
is a substantial infrastructure decision to take as a side effect of building a login
form. It remains the natural upgrade path if tenants ever want branded URLs.

**Global email uniqueness**, so an address identifies exactly one account. Simple, and it
gives up the multi-tenant membership the schema was designed for. It would also leak
across tenants at signup: "this address is taken" tells you the person belongs to some
other studio.

**A picker on the form, populated only after the address is recognised.** Still an oracle
— the picker's presence is itself the signal.

## Chosen approach

**Passkeys need no resolution at all.** A discoverable credential identifies exactly one
row in `passkey_credentials`, which carries both `user_id` and `organization_id`. The
tenant falls out of the credential, and the person never types an address. This is the
primary path, and it is the reason the passkey-first design is worth its complexity.

**OTP is the fallback, and it defers the choice.**
`findAccountsForEmailAcrossTenants` in `src/server/repositories/users.ts` is the one query
in the codebase that deliberately crosses tenant boundaries. Two things keep it honest,
and both are stated at the function:

1. Nothing it returns may reach the client until a code has been verified. Until then the
   response is identical whether the address has zero accounts or five.
2. It selects no health data — only the name and slug of studios the person is about to
   prove they belong to.

A code is sent to the address, not to an account. Verifying it proves control of the
address, and control of the address is exactly the entitlement needed to be told which
studios that address belongs to. Only then is a choice offered, and only then is a session
issued for the chosen organization.

## Impact

- **`findAccountsForEmailAcrossTenants` is a standing hazard.** It is an unscoped
  cross-tenant read living in a codebase whose central invariant is that scope comes from
  the session (ADR-004). It is documented as authentication-only at its definition, and
  the Phase 3 isolation suites should assert that nothing outside `src/server/auth/`
  imports it.
- **Sign-in costs one extra step for people with accounts at several studios.** Accepted:
  it is rare, and it is the step that keeps the common case from leaking.
- **A single-organization deployment sees none of this** — one account means the choice is
  skipped entirely.
- **Timing is now part of the contract.** If the "unknown address" path returns
  measurably faster than the "code sent" path, the enumeration defence is undone by a
  stopwatch. The sign-in service must do the same work either way.

## What this does not decide

- Subdomain-per-tenant routing, which stays available and would supersede this.
- How a person self-registers into an organization — that is the `join_code` flow, and it
  is a different question from signing in to an account that already exists.
- Whether a consultant working at two studios should be able to hold both sessions at
  once, or must sign out of one to enter the other.

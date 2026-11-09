# ADR-015 — Clerk proves identity; Adira keeps its own sessions and authorization

**Decision:** Clerk replaces Adira's in-house credentials — the emailed OTP (ADR-007, via
Resend) and in-house WebAuthn passkeys. A verified Clerk identity is converted into an
Adira session by Adira's own code, and everything after that is unchanged. Onboarding
follows the FlowDine OS invitation workflow (RASOIOS-ADR-006).

**Supersedes:** ADR-007 in full. **Amends:** ADR-011 (the credential that precedes a
session is now Clerk's; session lifetime, idle timeout and domain-keyed tokens are
unchanged). **Preserves:** ADR-001, ADR-004, ADR-012, ADR-013.

## Context

The user asked (2026-11-09) to remove Resend entirely, replace authentication with Clerk,
and make invitations work "like FlowDine OS". The Resend account was still on its sandbox,
so only one address could ever receive a sign-in code (CLAUDE.md, *State*).

Decisions taken with the user on 2026-11-09 before implementation:

| Question | Decision |
|---|---|
| SUPER_ADMIN storage | Keep `owner_accounts` separate (ADR-001), linked by Clerk user id — **not** FlowDine's `platform_role` on `users` |
| Adira's own passkeys | Removed; passkeys, if wanted, are enabled in Clerk |
| Access requests | Kept alongside invitations; approval now sends the invitation email |
| Rollout | Straight to production (it had no users) |

## Decision

1. **Clerk answers one question:** has this browser proved control of this email address?
   Only the Clerk-*verified primary* address counts (`src/server/auth/clerk-email.ts`).
2. **Adira's session layer is unchanged.** `/auth/continue` (tenant) and
   `/super-admin/auth/continue` (platform) turn the Clerk identity into the existing
   `adira_session` / `adira_owner_session` cookies. Every guard still reads PostgreSQL, so
   suspension, idle expiry and organization status take effect on the next request.
3. **Invite-only.** A Clerk user with no `INVITED` or `ACTIVE` account gets
   `/sign-in/no-access` and no database write. The Clerk instance runs in Restricted
   sign-up mode.
4. **Link-once.** Migration `012` adds `clerk_user_id` to `users` (unique per organization)
   and `owner_accounts`. The first sign-in binds the row; a row bound to a different Clerk
   user is an identity conflict — excluded, audited `IDENTITY_CONFLICT`, never re-bound.
5. **Invitations by email.** Every path that creates an `INVITED` account sends a Clerk
   invitation (`notify: true`, `ignoreExisting: true`) through `inviteAndAudit`: add
   member, CSV import (bulk), access-request approval, administrator provisioning, and
   `scripts/seed-owner.mjs`. A failed email never undoes the account and is audited.
6. **Sign-out ends both sessions.** "Sign out everywhere" also revokes every Clerk
   session, or a lost device would be re-admitted silently by `/auth/continue`.
7. **CSP keeps its nonce.** Clerk reads the nonce from the request's CSP header
   (`<ClerkProvider dynamic>`). Clerk's origin is decoded from the publishable key
   (`src/lib/clerk-origin.ts`); `worker-src blob:` is added only on the sign-in routes.
8. **Fail closed.** `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are required
   by the env schema; the app will not boot without them.

## Alternatives considered

- **Clerk sessions as Adira's sessions** (FlowDine's model: resolve the Clerk session on
  every request). Rejected: it rewrites ADR-011 and every guard, and moves "is this
  session still valid" outside PostgreSQL. Keeping Adira's sessions made the change
  touch the credential only.
- **SUPER_ADMIN as `users.platform_role`** (FlowDine). Rejected by the user; it breaks
  invariant 2.
- **Clerk Organizations as tenants.** Rejected for the reason RASOIOS-ADR-006 gives:
  authorization data would leave PostgreSQL.

## Consequences

- Two sessions exist per signed-in person: Clerk's (proof of identity) and Adira's
  (authorization). Adira's is authoritative; Clerk's only lets `/auth/continue` re-issue.
- `otp_challenges`, `webauthn_challenges` and `passkey_credentials` remain in the schema,
  unused. Dropping them is a separate forward migration, deliberately not done here.
- Email delivery, deliverability and the invitation template now live in the Clerk
  dashboard, not in this repository.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined at build time: changing it needs a rebuild.

**Status:** Accepted

**Date:** 2026-11-09

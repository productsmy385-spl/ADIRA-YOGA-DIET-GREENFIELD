# ADR-011 — Session lifetime, idle timeout, and domain-keyed session tokens

**Decision:** Tenant sessions last 30 days absolute with a 7-day idle timeout; platform
sessions last 12 hours absolute with a 2-hour idle timeout. Session tokens are stored as
**HMAC-SHA256 keyed by the identity domain's secret**, not as a bare hash.

**Status:** Accepted

**Date:** 2026-08-22

---

## Why

`docs/AUTHENTICATION.md` left three questions open for Phase 2: session lifetime, idle
timeout, and whether sliding expiry applies to both domains. Implementing sessions forced
all three, and turned up a fourth that the document had assumed was already settled.

### The fourth question: the secrets did nothing

`SESSION_SECRET` and `OWNER_SESSION_SECRET` were validated at boot, required to differ,
and **used nowhere**. ADR-001 claims that a leak of one cannot be replayed against the
other; in practice that claim rested entirely on `sessions` and `owner_sessions` being
two different tables.

That is weaker than it sounds. Both tables stored the same unkeyed SHA-256 of the token,
so a bug that looked a tenant token up against `owner_sessions` — a mistyped repository
import, a copy-pasted query, a future "unify the session lookup" refactor — would have
**matched**. The boundary was a naming convention enforced by nothing.

Keying the hash makes it cryptographic. A token minted in the tenant domain hashes to a
value that cannot appear in `owner_sessions` at all, whatever the calling code believes
it is doing. The secrets now do the work the environment schema already demanded of them.

### Lifetimes

The two domains get different numbers because they carry different risk and serve
different people.

**Tenant — 30 days absolute, 7 days idle.** Customers are on phones, and many will open
the app weekly rather than daily. A short session means signing in repeatedly, and the
realistic response to that friction is that people stop logging their practice — which
defeats the product rather than securing it. The exposure is bounded by the idle window
and, more importantly, by status being part of the authenticating query: suspending an
account kills its sessions on the very next request, with no sweep to wait for.

**Platform — 12 hours absolute, 2 hours idle.** A platform owner reaches every tenant, so
the convenience argument does not apply. Signing in at the start of the day is a
reasonable price for a credential that spans the whole platform.

### Absolute *and* idle, not one or the other

Absolute expiry alone lets a stolen cookie live its full term as long as the thief keeps
it warm. Idle timeout alone lets a session live forever under steady use. Both together
bound the two different failure modes, which is why `session-policy.ts` carries both and
tests assert that the idle window is strictly shorter than the absolute lifetime — if it
were not, the idle timeout could never fire and the policy would silently mean something
other than it says.

## Alternatives considered

**One lifetime for both domains.** Simpler, and wrong in one direction or the other:
whatever number suits a customer's phone is far too long for a credential that reaches
every tenant's health data.

**Sliding absolute expiry** — extend `expires_at` on every request. Rejected: it means a
session that is used regularly never expires at all, so the absolute ceiling stops being
a ceiling. `last_used_at` slides; `expires_at` does not.

**Bare SHA-256 for session tokens, as `hashToken` already does.** Adequate against the
threat that hashing addresses — a database disclosure not yielding usable tokens — and
silent on the threat ADR-001 actually cares about. Kept for non-session tokens, where
there is no domain to separate.

**Enforcing idle timeout in SQL** alongside absolute expiry. Rejected: it would embed the
interval in the query text, putting the policy in two places, and the policy is the part
most likely to change.

## Chosen approach

`src/server/auth/session-policy.ts` holds the numbers and the arithmetic as pure
functions, with 20 tests covering boundary behaviour in both directions — including the
clock-skew case where `last_used_at` is in the future, which must read as *active*, never
as idle.

`src/server/auth/tokens.ts` gains `hashSessionToken(token, secret)` and
`verifySessionToken`. The test that matters asserts that the same token does **not**
verify across the two secrets.

`src/server/auth/session.ts` is the only module that knows a session travels in a cookie.
`Secure` is derived from `APP_URL`, not `NODE_ENV` — a production build served over plain
HTTP would otherwise set `Secure`, drop the cookie, and present as "login does nothing".

## Impact

- **Rotating a session secret signs out that entire domain.** This is correct behaviour
  for a rotation, and it is why the two secrets must be rotated independently. It needs
  saying because "rotate the secrets" otherwise looks like a free operation.
- **`last_used_at` is written at most once a minute per session**, not on every request.
  Without that throttle every authenticated page load becomes a write, and `sessions`
  becomes the hottest table in the system for no benefit.
- **An idle session is revoked, not merely rejected**, so it cannot be revived by a
  request arriving a moment later.

## What this does not decide

- Whether a customer may hold multiple concurrent sessions, and the device-management UI
  for reviewing them. `revokeAllTenantSessions` exists; nothing calls it yet.
- Recovery when a customer has lost both their only passkey and their email address.
- Whether platform-owner sessions require step-up re-authentication before destructive
  operations. `STEP_UP` exists as an OTP purpose and is currently unused.

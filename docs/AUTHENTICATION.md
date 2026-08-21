# Authentication

**Status: designed, not implemented.** Phase 0 established the session schema, the two
identity domains, and the secrets. Phase 2 builds the flows. Nothing in this document is
working code yet, and no part of the application is currently authenticated.

## Primary: WebAuthn / passkeys

Platform authenticators — Face ID, Touch ID, Windows Hello, Android biometrics — plus
roaming security keys where a user has one.

**No biometric data is ever stored or transmitted.** The fingerprint or face never leaves
the device. What the device returns is a public key and a signed challenge; Adira stores
the public key, the credential id, and a signature counter in `passkey_credentials`
(Phase 2). This is worth stating plainly because "biometric login" invites the assumption
that a biometric template is being kept somewhere. It is not, and there is nowhere in the
schema to put one.

The relying-party id is derived from `APP_URL`. A mismatch makes registration fail in a
way that does not obviously point back at that variable — check it first.

## Fallback: OTP by email

Delivered through Resend (ADR-007), behind a delivery-adapter interface so SMS or
WhatsApp can be added later without touching OTP domain logic.

OTP is **not** a general-purpose login path. It is used for:

- account activation from an invitation
- account recovery when no passkey is available
- verifying a new device
- step-up before a security-sensitive action

Required properties, all enforced server-side:

| Property | Rule |
|---|---|
| Expiry | short, single-digit minutes |
| Attempt limit | small, per challenge; exhausting it invalidates the challenge |
| Rate limit | per account **and** per IP, so neither is a way around the other |
| Single use | consumed on success; replay fails |
| Storage | hash only — `otp_challenges` never holds the code itself |
| Comparison | timing-safe |
| Enumeration | identical response whether or not the address has an account |

`audit_logs` records that an OTP was issued, verified, or failed. It never records the
value.

## Sessions

Server-side and opaque. The cookie carries a random token; the database stores only its
hash, so a database disclosure does not hand over live sessions.

```
Set-Cookie: HttpOnly; Secure; SameSite=Lax; Path=/
```

`SameSite=Lax` rather than `Strict` so that following a link from an email — a reminder,
a report notification — does not land the customer on a signed-out page.

### Two cookies, two secrets

| Domain | Cookie | Secret | Session table |
|---|---|---|---|
| Tenant | `adira_session` | `SESSION_SECRET` | `sessions` |
| Platform | `adira_owner_session` | `OWNER_SESSION_SECRET` | `owner_sessions` |

Boot fails if the two secrets are equal — identical secrets would let a tenant cookie be
re-signed as a platform-owner cookie, collapsing the boundary ADR-001 exists to draw.

### Status is part of the authenticating query

The statement that loads a session filters on account status, rather than checking it
afterwards on the sign-in path:

```sql
SELECT … FROM sessions s
  JOIN users u ON u.id = s.user_id AND u.organization_id = s.organization_id
 WHERE s.token_hash = $1
   AND s.revoked_at IS NULL
   AND s.expires_at > now()
   AND u.status = 'ACTIVE'
```

A suspended account therefore cannot hold a live session *by construction*, not because
a check ran somewhere. Suspending someone takes effect on their next request, without a
separate revocation sweep. This is TaskFlow HR's `SESSION_SELECT` pattern, adopted for
the same reason.

## What sign-in reveals, and when

Unknown address and wrong credential produce the **same** response. Account state —
pending, rejected, disabled, locked — is revealed only *after* the credential verifies.

Returning those messages earlier would turn the sign-in form into a directory: it would
confirm an address has an account and which organization it belongs to. Ordering the
check after verification gives a person who holds the credential a useful message, and a
person who does not learns nothing.

One exception: an unexpired lock is reported without verification. That caller has
already had repeated attempts rejected, and leaving them to guess produces a support
ticket rather than security.

## Audit

Recorded: sign-in, failed sign-in, sign-out, passkey registration and removal, OTP issued
/ verified / failed, session revocation, and every privileged action.

Never recorded: OTP values, session tokens, credential secrets.

## Open for Phase 2

- Session lifetime, idle timeout, and whether sliding expiry applies to both domains.
- Whether a customer may hold multiple concurrent sessions, and the device-management UI.
- Recovery when a customer has lost their only passkey and their email address.
- Whether platform-owner sessions require step-up for destructive operations.

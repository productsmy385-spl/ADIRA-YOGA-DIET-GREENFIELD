# ADR-007 — OTP is delivered by email via Resend, behind a delivery adapter

**Decision:** One-time codes are sent by email using Resend. Delivery sits behind an
adapter interface so SMS or WhatsApp can be added later without touching OTP domain
logic.

**Why:** OTP is required for activation, recovery, new-device verification, and step-up
(§5 of the brief), so a delivery channel has to exist. The user chose email via Resend.

This is worth recording because the alternative was already tried elsewhere and left
unfinished: TaskFlow HR has real password-reset tokens and no email provider at all, and
documents delivery as explicitly out of scope. Naming the provider now avoids Adira
arriving at Phase 2 with the same gap.

**Alternatives considered:**

- *SMS (Twilio / MSG91)* — best reach for Indian wellness customers who may not check
  email. Costs per message and needs DLT template registration in India.
- *WhatsApp* — follows the TempleOS precedent of reaching end users on a channel they
  already use, but needs Meta Business verification and template approval, which is a
  large amount of setup before the first login works.
- *Adapter with a console driver and no provider* — defers the choice honestly, but
  leaves Phase 2 unable to demonstrate a complete flow.

**Chosen approach:** An adapter interface in `src/server/auth/` with a Resend
implementation. The OTP domain — issuing, hashing, expiry, attempt limits, rate limiting,
replay prevention — knows nothing about the channel. `RESEND_API_KEY` and
`OTP_FROM_EMAIL` are optional in the environment schema until Phase 2 makes them
required.

**Impact:**

- Email becomes a dependency of account recovery. A customer who loses both their passkey
  and access to their email address needs a human-mediated path; Phase 2 owes a decision
  on what that is.
- Adding SMS later is an adapter, not a refactor — provided nothing in the OTP service
  ever branches on the channel. Any `if (channel === …)` outside the adapter is the
  signal this decision has been eroded.
- Deliverability becomes an operational concern: SPF, DKIM, and a monitored bounce path,
  because a bounced OTP is an account lockout.

**Status:** Accepted

**Date:** 2026-08-21

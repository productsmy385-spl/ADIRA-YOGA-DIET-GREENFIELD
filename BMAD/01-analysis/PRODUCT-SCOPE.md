# Product Scope

**BMAD Phase 1 — Analysis.** What is in, what is out, and what is undecided.

## Relationship to the 19-phase roadmap

This document says **what** the product contains. `docs/ROADMAP.md` says **in what order**
it gets built, across 19 phases (0–18), and remains authoritative for order and status.
BMAD's nine stages are the *method* applied within that programme, not a replacement for
it. `BMAD/STATUS.md` maps BMAD's 19 epics onto the roadmap's 19 phases.

## In scope

### Core loop — the product's reason to exist

| Capability | Roadmap phase |
|---|---|
| Yoga exercise library and programme builder | 6 |
| Diet food/meal library, programmes, schedules | 7 |
| Programme assignment generating a daily schedule | 6, 7 |
| Daily activity engine with six states | 5 |
| Daily wellness check-in | 5 |
| Adherence and progress computed from real records | 5, 11 |

### Surfaces

| Capability | Roadmap phase |
|---|---|
| Customer dashboard and journey | 5 |
| Consultant dashboard and per-customer workspace | 8 |
| Org owner dashboard — analytics, consultant performance | 9 |
| Platform owner dashboard — tenants, platform health | 9 |

### Platform

| Capability | Roadmap phase |
|---|---|
| Passkey authentication, OTP fallback, sessions | 2 |
| RBAC, tenant isolation, IDOR/BOLA suites | 3 |
| Notifications — in-app, push, email | 10 |
| Weekly/monthly reporting, async generation | 11 |
| ImageKit media with server-authorised upload | 12 |
| CSV import/export with preview and validation | 13 |
| PWA install | 14 |
| 3D yoga guide with low-power fallback | 15 |
| i18n architecture, English first | after 5, before 8 |

## Out of scope

### Permanently, or until a decision reopens it

- **Diagnosis or clinical recommendation.** The product records what a qualified
  consultant prescribed. It does not prescribe.
- **Customer-to-customer visibility of any kind.** No social features, no leaderboards, no
  shared progress. Customers must not be able to establish that other customers exist.
- **Wearables, automatic activity detection, camera pose correction.** v2.0 §38 defers
  these. Completion is self-reported, and the product is honest about that.
- **Native mobile applications.** PWA install covers the requirement. v2.0 §38 defers
  native.
- **Video consultations.** Appointments are scheduled in Adira; the call happens
  elsewhere.
- **AI-generated health advice to customers.** v2.0 §38 is explicit that automated insight
  must be bounded and consultant-reviewed. Any future AI advises the consultant.

### Deferred, with a named reason

- **SMS and WhatsApp OTP.** The adapter interface exists (ADR-007); only the Resend email
  driver will be built. Adding a channel is an adapter, not a refactor.
- **Per-organisation white-labelling.** `organizations` has no branding columns. Cheap to
  add later; the design system would need a per-tenant token layer, which is not cheap.
- **Row-Level Security.** Considered and deferred in ADR-004 — it would supplement
  session-derived scoping and composite foreign keys, not replace them.

## Decided by the user, 2026-08-22

The two material questions raised by the analysis are now settled. Both were introduced
by the architecture posters and absent from the written brief, and both resolved the way
v2.0 implied.

### Billing and subscriptions — OUT of scope for the MVP

No subscription domain, no payment provider, no billing surface on the owner dashboard,
regardless of what the poster shows. v2.0 §38 lists it as future work and it stays there.

**Consequence:** Phase 9's owner dashboard is analytics and operations only. The
`organizations` table gains no plan, seat, or subscription columns. If billing arrives
later it is additive — a new domain alongside, not a reshaping of tenancy — which is why
deferring it costs nothing structurally.

### Messaging — one-way notifications only

`ADMIN`/consultant → `CUSTOMER`. **Explicitly not built:** realtime chat, conversations,
threads, read receipts on a conversation, or any customer-initiated message.

**Consequence for Phase 10:** there is a `notifications` table and no `conversations` or
`messages` table. A "consultant message" is a notification *event*, exactly as v2.0
lists it — it has a sender, a recipient, a body, and a read flag, and it does not have a
parent thread or a reply path.

This is the cheaper direction to be wrong in: adding conversations later means adding
tables, whereas building threads now and discovering nobody wants them means carrying
schema and UI that must still be kept working. Note that a customer's only channel back
to their consultant is therefore the daily check-in's notes field and the appointment
flow — worth confirming with a real pilot that this is enough.

## Still undecided

| # | Question | Blocks | Working assumption |
|---|---|---|---|
| 1 | The **official logo**. | Phase 14 | Placeholder redrawn from the posters. |
| 2 | Which **Linear team** owns this work. | project tracking | Unrecorded; no issues created. |
| 3 | The `[proposed]` **"needs attention"** definition in `docs/METRICS.md`. | Phase 8 | Six signals as specified; needs confirmation because it decides what a consultant looks at first. |

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

## Undecided — these block a complete PRD

Carried from `docs/ROADMAP.md`. Each needs the user, and each is assumed in the PRD with
the assumption stated.

| # | Question | Blocks | Assumed for now |
|---|---|---|---|
| 1 | Is **billing/subscription** in scope? The supplied poster shows "Subscription & Billing" on the owner dashboard; the written brief never mentions it, and v2.0 §38 lists it as *future*. | Phase 9 | **Out of scope.** v2.0 is the governing document and defers it. |
| 2 | Is **consultant↔customer messaging** real? The poster shows "Messages" on both dashboards; v2.0 lists notifications and "consultant message" as a notification *event*, not a conversation. | Phase 10 | **One-way consultant→customer messages, delivered as notifications.** No threaded conversation, no customer-initiated messages. |
| 3 | The **official logo**. | Phase 14 | Placeholder redrawn from the posters. |
| 4 | Which **Linear team** owns this work. | project tracking | Unrecorded; no issues created. |

Questions 1 and 2 are the material ones. Both were introduced by the architecture posters
and are absent from the written brief — the posters are illustrative, v2.0 is governing,
so both are treated as out of scope until the user says otherwise. If either is real,
each needs its own schema and its own phase; neither can be bolted onto an existing one.

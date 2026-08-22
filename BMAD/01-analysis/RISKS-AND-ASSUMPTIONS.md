# Risks and Assumptions

**BMAD Phase 1 — Analysis.** Risks are ordered by expected damage, not likelihood.

## Risks

### R1 — Cross-tenant or cross-customer data leak · CRITICAL

Adira holds identifiable health information for multiple organisations. One leak ends the
product commercially and harms real people.

**Mitigations in place (Phase 0):** tenant scope derived from the session only (ADR-004);
composite foreign keys making cross-tenant links unrepresentable in PostgreSQL; two
separate identity domains (ADR-001); strict rank rules; `verify-schema.mjs` asserting the
composite keys still exist, wired into CI.

**Residual:** the *enforcement layer* does not exist yet. Rules are tested; no route
consumes them, because no route exists. **Phase 3 must not be skipped or compressed** —
its isolation suites are the only thing that converts these rules into a guarantee.

### R2 — The adherence numbers are wrong · HIGH

Every metric is derived: adherence, completion, engagement, retention, consultant
performance. A defect in derivation is invisible — the number still looks like a number —
and a consultant may change someone's therapy because of it.

**Mitigation:** metric definitions written down before implementation (PRD §
Metrics), computed in the service layer with unit tests over known fixtures, never in a
component. No metric may be computed in two places.

**Residual:** self-reported completion is unverifiable by construction. The product must
present adherence as *reported* adherence and never imply verification.

### R3 — Nobody uses it after week two · HIGH

Health-behaviour products have poor retention. If the daily loop is even slightly
tedious, customers stop, and every downstream metric becomes noise.

**Mitigation:** J1 is designed around taps, not features. Session lifetime long enough
that a 5am open never demands re-authentication. Notifications tuned to prompt without
nagging.

**Residual:** unmeasurable before real users. This is the risk most likely to be
discovered only after Phase 5, and it should be tested with a real pilot organisation
before Phase 15's 3D work is funded.

### R4 — The product is treated as clinical · HIGH

A consultant may act on a trend line as if it were diagnostic; a customer may read
computed "progress" as medical improvement.

**Mitigation:** boundaries stated in `PRODUCT-CONTEXT.md`; metrics labelled by what they
actually measure; no computed insight presented to a customer as advice.

**Residual:** partly a legal and regulatory question this project has not investigated.
**Flagged as needing the user's input before any real customer data exists.**

### R5 — Consultant performance metrics are unfair · MEDIUM

A consultant given the hardest cases will show the worst adherence. Presenting that as
performance is wrong and organisationally corrosive.

**Mitigation:** label metrics as *adherence of assigned customers*, never as consultant
quality. Show caseload alongside.

### R6 — OTP delivery failure locks people out · MEDIUM

A bounced OTP is an account lockout (ADR-007), and email deliverability is not fully
controllable.

**Mitigation:** SPF/DKIM and a monitored bounce path; passkeys as primary so OTP is the
exception; the adapter allows SMS later.

**Residual, unresolved:** the customer who has lost both passkey and email access. No
answer exists. Needs a policy, not just code — `docs/AUTHENTICATION.md` carries it as open
for Phase 2.

### R7 — Programme edits rewrite history · MEDIUM

If assignment references a programme rather than copying it, editing that programme
retroactively changes what past customers were told to do — corrupting the adherence
record against it.

**Mitigation:** none yet. **Phase 6 must decide explicitly** between versioned programmes
and copy-on-assign. Flagged in J4.

### R8 — Async jobs silently stop · MEDIUM

Reports and notifications run through a Postgres queue drained by Railway Cron (ADR-003).
Cron schedules live in the Railway dashboard, invisible to git. If a schedule is removed
or `CRON_SECRET` drifts, the queue fills and nothing reports it.

**Mitigation:** the schedule register in `docs/RAILWAY.md`. **Insufficient.** Phase 11
should add queue-depth and oldest-job-age to the platform owner dashboard, so a stalled
drain is visible rather than inferred.

### R9 — Offline completion is lost · MEDIUM

A practice room may have no signal, but health data must not be cached offline
carelessly (v2.0 §22).

**Mitigation direction:** queue the *action*, never cache the *record*. Phase 14.

### R10 — Two agents editing one repository · LOW, but live

Two Claude sessions have already worked in this repository concurrently and one commit
swept the other's staged work. TaskFlow HR records the same incident class.

**Mitigation:** re-read before writing; commit explicit paths, never `-A`, while another
session is active.

## Assumptions

Each would change the product materially if wrong. Stated so they can be checked rather
than discovered.

| # | Assumption | If wrong |
|---|---|---|
| A1 | Billing is **out of scope** (v2.0 §38 defers it; only a poster suggests otherwise) | Phase 9 grows a subscription domain, schema, and provider integration |
| A2 | Messaging is **one-way consultant→customer**, delivered as notifications | A real conversation domain is needed — threads, read state, its own phase |
| A3 | Customers self-report completion; no verification | The activity engine changes shape entirely |
| A4 | One organisation per customer account; the same person at two organisations has two accounts (schema enforces email-unique-*per-org*) | Identity model changes; cross-org account linking is a significant redesign |
| A5 | Consultants work in one organisation | Same as A4 |
| A6 | English first; other languages are translation, not localisation of clinical content | Yoga/diet instructions need per-language human review — v2.0 §26 already hints at this |
| A7 | Programmes are prescribed by a qualified human, never generated | Regulatory exposure changes completely |
| A8 | Adira schedules appointments; consultations happen elsewhere | Video infrastructure becomes in scope |
| A9 | A tenant's data volume stays within one Postgres instance for the foreseeable future | Sharding or read replicas; ADR-003's single-datastore reasoning weakens |
| A10 | Railway remains the deployment target, architecture stays portable | `railway.json` and the cron model need replacing; nothing else should |

## Open questions for the user

1. **Billing** — in scope (A1)?
2. **Messaging** — conversation or notification (A2)?
3. **Regulatory posture** (R4) — what jurisdiction, and is there a compliance regime that
   applies to holding this data?
4. **Recovery policy** (R6) — what happens when someone loses passkey *and* email?
5. The **official logo**, and the **Linear team**.

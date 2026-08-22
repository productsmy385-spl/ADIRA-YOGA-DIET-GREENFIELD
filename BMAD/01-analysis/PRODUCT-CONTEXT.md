# Product Context

**BMAD Phase 1 — Analysis.** Source: `docs/KNOWLEDGE-BASE.md` (Master Knowledge Base
v2.0). Written 2026-08-22, after Phase 0 was already built — see `BMAD/STATUS.md` for why
that ordering is honest rather than ideal.

## Problem statement

A yoga therapist's work does not fit the tools they have. The therapy itself is
longitudinal — a programme unfolds over weeks through assessment, foundation, breathing,
flexibility, strength, balance, meditation, and maintenance — but the tooling available is
either a scheduling app that knows nothing about the programme, or paper and WhatsApp.

Three consequences follow, and they are the product's reason to exist:

1. **The consultant cannot see adherence.** Whether a customer actually practised on
   Tuesday is unknown until the next session, by which point a fortnight of drift has
   already happened. Advice is given against a guess.
2. **The customer loses the thread between sessions.** The plan exists on paper, the
   reminder does not exist at all, and the gap between "what I was told to do" and "what I
   did" is invisible to everyone until it is large.
3. **The organisation cannot see itself.** An owner running several consultants has no
   view of retention, engagement, or which consultant's customers actually improve.

The product closes the loop: assign a programme, schedule it into days, capture completion
and a daily check-in, compute adherence from those records, surface it to the consultant
while it is still actionable, and report it upward.

## Target users

Four principals across two identity domains (`decisions/ADR-001`, `ADR-002`).

### Customer — the person receiving therapy

Often not a technology enthusiast, frequently older, frequently on a mid-range Android
phone, sometimes with limited English. Opens the app early in the morning before practice
or late at night to check in.

**What they need:** to know what to do today, mark it done in a few taps, and see that
they are making progress. Nothing else.

**What breaks them:** a login that fails at 5am, a plan that takes four taps to find, an
interface that assumes fluent English, motion that makes them nauseous. This is why
passkeys are primary, why `prefers-reduced-motion` is honoured globally, and why the i18n
architecture exists before any second language does.

### Admin / consultant — the person delivering care

The combined admin/consultant role (ADR-002). Manages a caseload of assigned customers,
builds and assigns programmes, reviews activity, writes notes, sends results.

**What they need:** to see, quickly, which of their customers are drifting — not a list of
everyone, a list of who needs attention today.

**What breaks them:** a dashboard that reports totals instead of exceptions.

### Org owner — the person who runs the organisation

The most senior role inside one organisation, with organisation-wide reach.

**What they need:** consultant performance, retention, engagement, and operational alerts.
Whether the business is working.

### Platform owner — the operator of Adira

A separate identity domain entirely. Spans every organisation. Manages tenants, watches
platform health, and is deliberately *not* able to walk into a tenant's data through a
rank check (ADR-001).

## Business goals

1. **Make adherence visible while it is still actionable** — the core value proposition.
   Every metric in the product derives from real records; none is estimated.
2. **Let one consultant carry a larger caseload** without lowering care quality, by
   directing attention to exceptions.
3. **Be sellable to multiple organisations** — multi-tenant from the first migration, not
   retrofitted.
4. **Earn trust with health data.** The product holds identifiable health information. A
   single cross-tenant leak would end its commercial life, which is why isolation is a
   database constraint and not an application convention.

## Product boundaries

**Adira is a therapy-delivery and adherence system.** It is not:

- **A medical device or diagnostic tool.** It records what a qualified consultant
  prescribed and what the customer did. It does not diagnose, and it must not present
  computed trends as clinical conclusions.
- **A replacement for professional judgement.** v2.0 §38 is explicit: automated insight
  must be bounded and reviewed. Any future AI feature advises the consultant; it never
  advises the customer directly.
- **A fitness tracker.** No wearables, no automatic activity detection, no pose
  correction. Completion is self-reported, and the product is honest that self-reported
  data is what it is.
- **A social product.** No customer-to-customer visibility of any kind. Customers cannot
  discover that other customers exist.
- **A payments system.** Whether billing is in scope is unresolved — see
  `RISKS-AND-ASSUMPTIONS.md`.

## Why this shape

Three decisions were already made before this document existed, and they constrain
everything downstream. They are recorded properly as ADRs; noted here because a reader of
the analysis needs them:

- Two identity domains, never mixing (ADR-001).
- `ADMIN` reaches assigned customers only; org-wide reach is `ORG_OWNER` (ADR-002).
- Tenant scope comes from the session, and composite foreign keys make cross-tenant links
  unrepresentable in the database (ADR-004).

The third is the one that matters most for a product holding health data: it means a
cross-tenant leak is not a bug we are trying not to write, but a row PostgreSQL will
refuse to store.

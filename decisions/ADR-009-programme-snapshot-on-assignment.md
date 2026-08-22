# ADR-009 — Assigning a programme snapshots it; the template is never referenced live

**Decision:** Assigning a yoga or diet programme to a customer **copies** its structure
into customer-owned rows. The customer's plan is thereafter an independent object. The
template it came from is recorded as provenance (`source_programme_id`,
`source_version`) and is never read again when rendering or scoring that customer's plan.

**Status:** Accepted

**Date:** 2026-08-22

---

## Why

Two forces point the same way, and one of them is a data-integrity problem serious enough
to decide this before Phase 6 writes a line of schema.

**Adherence is scored against what the customer was told to do.** If assignment holds a
live reference to a template, then editing that template retroactively changes history.
A consultant who adds a fourth session to "Foundation — Week 2" on Thursday has, by
reference, changed what every customer on that programme was supposed to have done on
Monday — and every adherence figure computed against it silently becomes wrong. Nothing
errors. The numbers just quietly stop meaning what they say, which is
`RISKS-AND-ASSUMPTIONS.md` R2 arriving through the back door.

**The product's core promise is personalisation.** The brief says *personalised* yoga and
diet plans throughout. A consultant will adjust one customer's plan — drop a pose that
aggravates a knee, shorten a session, swap a meal. Those adjustments cannot live in a
shared template, because they are not shared. So per-customer rows have to exist
regardless; the only question is whether they are created at assignment or bolted on
later as an override layer.

An override layer on top of a live reference is the worst of both: history still moves
under you, and every read becomes a merge of template plus overrides that must be
evaluated identically in the scheduler, the customer view, the consultant view, and the
report generator.

## Alternatives considered

**Versioned programmes; assignment pins a version.** The textbook answer, and genuinely
sound: editing creates version N+1, existing assignments stay on N, history is stable.
Rejected because it solves only the first force. Per-customer personalisation still needs
somewhere to live, so this buys a version table *and* still needs override rows — more
machinery for the same destination. It is also worse for the consultant's mental model:
"this customer is on v3 of Foundation, with four overrides" is harder to reason about
than "this is Anita's plan."

**Live reference, edit freely.** Simplest to build, and wrong. Described above.

**Live reference, immutable once assigned.** Stops history moving, at the cost of making
templates unusable — a consultant who spots a typo in a programme used by thirty
customers can never fix it. Rigidity that will be worked around by cloning templates,
which is snapshotting done manually and badly.

## Chosen approach

At assignment, copy the programme's sessions, exercises (or meals), ordering, durations,
and scheduling rules into customer-scoped tables. Record on the assignment:

- `source_programme_id` — which template, for analytics and "where did this come from"
- `source_version` — an integer bumped on every template edit, so provenance stays
  meaningful even after the template moves on
- `assigned_by`, `assigned_at`

Editing a template bumps its version and affects **nobody** already assigned. Pushing a
template change to existing customers is an explicit, deliberate operation — a re-assign
— not a side effect of saving an edit.

## Impact

- **Schema:** customer plan tables are peers of the template tables, not views over them.
  More rows, and the duplication is the point rather than a cost to be optimised away.
  Do not "normalise this away" later; that reintroduces exactly the failure above.
- **Adherence is stable by construction.** A scored day can never be re-scored by an edit
  somewhere else. This is what lets R2's mitigation actually hold.
- **"Which customers are on Foundation?"** becomes a query over `source_programme_id`
  rather than a foreign key join. Slightly more work, and still cheap.
- **Bulk update is not free.** Rolling a corrected template out to thirty active customers
  is thirty re-assignments, and each one must decide what happens to days already
  completed. Phase 6 owes that rule; the safe default is that the past is never rewritten
  and only future days change.
- **Storage grows with assignments rather than templates.** At the scale this product
  plausibly reaches, that is not a consideration.

## What this does not decide

- Whether a re-assign preserves completion history for days that overlap. Phase 6.
- Whether customers can see that their plan came from a named programme, or only see
  "your plan". A product question, deferred to the Phase 5/6 UX.

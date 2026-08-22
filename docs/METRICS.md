# Metrics

Every number this product shows is derived from records. This file defines each one
**before** it is implemented, because a wrong metric is invisible — it still looks like a
number — and a consultant may change someone's therapy because of it
(`BMAD/01-analysis/RISKS-AND-ASSUMPTIONS.md` R2).

## Rules

1. **One definition, one implementation.** Each metric is computed in exactly one service
   function. A metric computed in two places will disagree in one of them.
2. **Never in a component.** Components render numbers; they do not derive them.
3. **Denominators are explicit.** Most metric bugs are denominator bugs. Every definition
   below states its denominator and what it excludes.
4. **Name what is actually measured.** It is *reported* adherence, not adherence.
   Completion is self-reported and unverifiable by construction; the product must never
   imply otherwise.
5. **Undefined is not zero.** A customer with no scheduled activities has *no* adherence,
   not 0%. Rendering "0%" for someone who was never given anything to do is a lie that
   looks like a fact, and it will put people on the attention list who do not belong
   there.

---

## Activity metrics

### Scheduled activities

The denominator for almost everything. An activity counts as scheduled for a date if it
belongs to an active assignment and its `scheduled_at` falls on that date.

**Excluded:** rest days (nothing is scheduled, so nothing is missed), days before the
assignment started, days after it ended, and every day of a paused assignment.

Pausing is the important one. A customer on holiday with a paused plan must not
accumulate missed activities, or they return to a wall of failure and a consultant is
told to chase someone who did exactly what was agreed.

### Reported completion rate

```
completed / (completed + missed + skipped)
```

over a stated window, per activity type.

`PENDING` and `STARTED` activities for the **current day** are excluded from both parts —
the day is not over, and counting them as failures makes every customer look bad until
bedtime. A `PENDING` activity whose date has passed becomes `MISSED` by the daily sweep,
at which point it enters the denominator.

`REVIEW_REQUIRED` is excluded entirely. It is a consultant workflow state, not an outcome.

**Undefined when the denominator is zero.**

### Yoga adherence · Diet adherence

Reported completion rate filtered to that activity type. Reported separately and never
averaged together: they fail for different reasons and a consultant responds to them
differently. A customer practising faithfully but eating badly is a specific,
recognisable situation that a blended 70% hides.

### Missed activities

Count of `MISSED` in the window. An absolute count, not a rate — three missed sessions
matters the same whether the plan had five or fifteen, and the rate already exists
separately.

---

## Check-in metrics

### Check-in consistency

```
days with a check-in / days with an active assignment
```

over the window. Independent of whether activities were completed: checking in to say
"I did not practise today" is engagement, not failure, and must never be penalised.

### Mood and sleep trend

Rolling averages of self-reported values. Presented **only** to the consultant, never to
the customer as an assessment, and never labelled with clinical language.

---

## Engagement and retention

### Engagement

A customer is engaged in a window if they completed at least one activity **or** submitted
at least one check-in. Deliberately generous: this measures contact with the product, and
a customer who checks in daily while struggling is engaged.

### Active customer

A customer with an active assignment **and** engagement in the last 14 days. Both
conditions — an assignment with no activity is dormant, and activity without an
assignment is not possible.

### Retention

Of customers active at the start of a period, the proportion still active at the end.
Customers who joined mid-period are excluded from both parts, or joiners flatter the
figure.

---

## "Needs attention" — the consultant triage signal

The most important definition in the system. The consultant dashboard exists to answer
"who needs me today", and a dashboard that reports totals instead of exceptions does not
let anyone carry a larger caseload (`USER-JOURNEYS.md` J3).

**[proposed] — needs your confirmation. This drives what a consultant looks at first,
which makes it a clinical-adjacent judgement rather than an engineering one.**

A customer is flagged if **any** signal fires. Each flag carries its reason; the list is
ranked by the highest-severity signal.

| # | Signal | Threshold | Severity |
|---|---|---|---|
| S1 | Consultant-flagged | any `REVIEW_REQUIRED` activity | highest |
| S2 | Never started | assigned > 3 days ago, zero completions ever | high |
| S3 | Sustained absence | no check-in **and** no completion for 4+ consecutive days on an active plan | high |
| S4 | Adherence collapse | completion rate down ≥ 25 points vs **their own** previous 7 days | medium |
| S5 | Repeated misses | 3+ missed activities in 7 days | medium |
| S6 | Wellbeing decline | 3+ consecutive check-ins reporting lowest-band mood or sleep | medium |

### Why these, and not a single threshold

**S4 compares a customer to themselves, not to a cohort.** An absolute rule — "flag
anyone below 60%" — permanently flags customers with legitimately lower capacity, whose
55% may be exactly what was agreed, while missing the customer who fell from 95% to 70%
and is the one actually in trouble. A drop against personal baseline is the signal;
a low absolute number often is not.

**S2 exists because the worst failure is silent.** A customer who never starts generates
no missed-activity pattern interesting enough to trip a rate-based rule, and simply
disappears.

**S3 requires both no check-in and no completion.** Either alone is noise: a customer who
practises without checking in is fine, and one who checks in without practising is
already caught by S5.

**S6 is deliberately conservative** — lowest band only, three in a row. Mood data is
self-reported and noisy, and a signal that fires often is a signal consultants learn to
ignore, which is worse than not having it.

### What must never flag

- A paused assignment. Nothing is scheduled, so nothing is missed.
- A rest day.
- A customer in their first 3 days, except via S1.
- A customer with no active assignment.

### What this is not

Not a risk score, not a severity ranking of people, and never shown to the customer.
It is a work queue for the consultant. It must be labelled in the UI as what it is —
"customers to review" — and not as anything resembling a clinical assessment.

---

## Consultant metrics

### Caseload

Count of active assigned customers. Always displayed **alongside** any adherence figure
for that consultant.

### Adherence of assigned customers

Mean reported completion rate across a consultant's active customers.

**This is not a measure of consultant quality, and must never be labelled as one.** A
consultant given the most difficult customers will show the worst number
(`RISKS-AND-ASSUMPTIONS.md` R5). The label in the UI is *adherence of assigned customers*,
shown next to caseload. Any shorter label is a misrepresentation with organisational
consequences.

---

## Windows

Default 7 days, aligned to the **organisation's** timezone (`organizations.timezone`), not
the server's and not the viewer's. Two people looking at the same organisation must see
the same week boundary, or two dashboards disagree and neither is wrong.

Monthly reports use calendar months in the same timezone.

---

## Testing

Every metric gets unit tests over fixtures with known answers, including:

- the zero denominator (undefined, not 0%)
- a paused assignment mid-window
- a customer whose assignment started mid-window
- current-day `PENDING` excluded, past-day `MISSED` included
- each "needs attention" signal firing alone, and each exclusion suppressing it

# User Journeys

**BMAD Phase 1 — Analysis.** The journeys the product must serve, and the failure points
in each. Failure points are listed because they are what acceptance criteria get written
against.

---

## J1 — Customer: the daily loop

The journey the product lives or dies by. It happens ~365 times a year per customer;
everything else happens occasionally.

```
open app → already signed in → today's plan
  → start an activity → perform it away from the phone
  → mark complete → check in → see progress move
```

**Preconditions:** an active programme, a scheduled day, a valid session.

| Step | Requirement | Failure point |
|---|---|---|
| Open | Signed in without friction | Session expired overnight. A customer who must re-authenticate at 5am does not practise. Session lifetime is a product decision, not a security default. |
| Today's plan | Yoga and diet for *today*, above the fold, no navigation | Plan is two taps deep, or shows the whole week |
| Start | One tap; records `started_at` | Requires the phone during practice — it will be in another room |
| Complete | One tap, works minutes or hours later | Completion window too tight; an evening practice marked next morning must still count |
| Check in | Mood, sleep, water, adherence, notes — under 30 seconds | Too many fields. Long check-ins get skipped, and a skipped check-in is missing data |
| Progress | Visible, honest movement | Percentages that jump confusingly, or that flatter |

**Offline:** the phone may have no signal in a practice room. Completion must not be lost.
This is a real constraint on the PWA phase — but caching health data offline is itself a
risk (v2.0 §22), so the resolution is queue-the-action, never cache-the-record.

---

## J2 — Customer: onboarding

```
invited by consultant → email → verify (OTP) → enrol passkey
  → assessment → first programme assigned → first day
```

**Failure points:** OTP does not arrive (a bounced OTP is an account lockout — ADR-007);
passkey enrolment fails on an unsupported browser and there is no fallback; the customer
lands on an empty dashboard because no programme is assigned yet, and cannot tell whether
the app is broken or simply waiting.

That last one is a real design requirement: **the empty state must distinguish "nothing
assigned yet" from "something went wrong."**

---

## J3 — Consultant: the morning triage

The journey that determines whether a consultant can carry a larger caseload.

```
sign in → dashboard shows WHO NEEDS ATTENTION
  → open that customer → see their week
  → adjust plan / add note / send message → move on
```

**The critical requirement:** the dashboard opens on exceptions, not on totals. "You have
32 customers" is not actionable. "4 customers missed three or more sessions this week" is.

| Step | Requirement | Failure point |
|---|---|---|
| Dashboard | Ranked list of customers needing attention, with the reason | An unranked table sorted by name |
| Open customer | Only assigned customers reachable (ADR-002) | Any path that lists unassigned customers, even by name |
| See the week | Adherence, check-ins, missed sessions, trend | Raw event log the consultant must interpret |
| Adjust | Change the plan without rebuilding it | Editing requires re-assigning the whole programme |

**"Needs attention" must be defined before this can be built** — it is the single most
important product definition in the system. Proposed in the PRD.

---

## J4 — Consultant: building and assigning a programme

```
exercise library → build programme (weeks, sessions, exercises)
  → assign to customer → schedule generates → customer sees it tomorrow
```

**Failure points:** assignment generates a schedule retroactively and immediately marks
past days missed; editing a programme silently rewrites the history of customers already
on it. **A programme edit must not alter what a customer was already told to do** —
programmes need versioning, or assignment needs to copy rather than reference. This is an
architecture decision that Phase 6 must make explicitly.

---

## J5 — Org owner: the weekly review

```
sign in → organisation dashboard → adherence, engagement, retention
  → consultant performance → weekly report → act
```

**Failure point:** consultant performance metrics that are unfair. A consultant assigned
the most difficult customers will show the worst adherence. Presenting that as
"performance" without context is both wrong and organisationally corrosive. Metrics must
be described honestly — *adherence of assigned customers*, not *consultant quality*.

---

## J6 — Platform owner: tenant operations

```
separate login → platform dashboard → organisations
  → create/suspend a tenant → platform health → audit
```

**Failure point:** any path that lets a platform owner read tenant health data casually.
ADR-001 gives platform intervention no implicit route; when a genuine support need
arises, it must be an explicit, individually audited action — not a side effect of
browsing.

---

## J7 — Recovery: the customer who cannot get in

The journey nobody designs and everybody eventually needs.

```
lost phone (passkey gone) → OTP to email → new device verification → re-enrol passkey
```

**Failure point, unresolved:** the customer who has lost *both* the passkey and access to
the email address. There is currently no answer. `docs/AUTHENTICATION.md` records it as
open for Phase 2; it needs a human-mediated path, which means it needs a policy, not just
code.

---

## Journey coverage vs roadmap

| Journey | Phases that must land first |
|---|---|
| J1 daily loop | 1, 2, 3, 4, 5, 6, 7 |
| J2 onboarding | 2, 3 |
| J3 triage | 4, 5, 8 |
| J4 programme building | 6, 7, 8 |
| J5 owner review | 9, 11 |
| J6 tenant operations | 9 |
| J7 recovery | 2 |

**J1 is not deliverable until Phase 7.** That is a long time before the product's central
loop can be exercised end to end, and it is the strongest argument for the roadmap order
being right: everything before Phase 5 exists to make J1 trustworthy when it arrives.

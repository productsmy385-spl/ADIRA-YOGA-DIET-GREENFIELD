# Impact analysis — role model change, access requests, account provisioning

**Status:** analysis only. No code or schema has been changed.
**Date:** 2026-08-23
**Trigger:** user's "Update role, access request & account provisioning architecture" brief.

Requested change: collapse `OWNER` + `ADMIN` into a single `ADMIN`, keep Super Admin
separate, rename the end-user role to `USER`, and add a public access-request system with
admin review and account provisioning.

This document is the Phase 1 (Analysis) artefact BMAD requires before the work starts. It
records what exists, what breaks, what conflicts, and what must be decided by a human
before implementation.

---

## 1. The headline finding — a conflict that resolves, but only if stated

**ADR-002 (2026-08-21) explicitly considered and rejected the exact model this brief
appears to ask for.** Its rejected alternative reads:

> *Combined and org-wide* — simplest permission matrix, and the reading most people would
> reach for. Rejected: it makes every consultant able to read every customer's health
> record in the organization, and quietly deletes a stated security requirement.

The stated requirement is the user's own Master Knowledge Base §35.5:

> 5. Admin cannot access unauthorized customers.

The new brief §2 says *"Admin is scoped to their organization"*, which on a plain reading
means org-wide reach over every member. **But the same brief's §19.5 says:**

> 5. Admin can access only authorized members.

**These two statements are only compatible under one reading, and it is the correct one:**

| Reach | Scope after the change |
|---|---|
| **Administrative** — manage members, review access requests, create accounts, suspend | **Organization-wide** |
| **Member health data** — activities, check-ins, progress, reports, plans | **Assignment-scoped**, via `consultant_assignments` |

Merging the roles therefore changes *who may administer the organization*, and changes
**nothing** about who may read a given member's health record. ADR-002's core rule
survives; only its carrier changes from `ORG_OWNER` to "any ADMIN with an assignment".

**This must be written into the new ADR explicitly.** Implemented from §2 alone, the
obvious shortcut — make `hasOrganizationWideReach()` return `true` for `ADMIN` — silently
deletes the brief's §35.5 requirement and exposes every member's health record to every
admin. That is a one-line change with a large consequence, which is exactly the kind that
gets made by accident.

---

## 2. Terminology mapping

| Brief's name | Exists today as | Nature of change |
|---|---|---|
| `SUPER_ADMIN` | `PLATFORM_OWNER` in `owner_accounts` | **Rename only.** The boundary is already correct. |
| `ADMIN` | `ORG_OWNER` **+** `ADMIN` in `users` | **Merge.** Enum, rank ladder, unique index, 72 code references. |
| `USER` | `CUSTOMER` in `users` | **Rename.** |

### Super Admin already behaves as the brief requires

ADR-001's two identity domains map cleanly onto Super Admin vs organization. No
architectural change is needed:

- `owner_accounts` has **no `organization_id` column** — a platform account cannot be
  scoped to a tenant because there is nowhere to put the value.
- Separate session table, separate cookie, separate signing secret (ADR-011 made that
  boundary cryptographic, not merely structural).
- `canActOn` deliberately gives `PLATFORM_OWNER` **no** authority over tenant users, so
  brief §15 ("Super Admin should not automatically receive unrestricted access to
  individual member health information") is already honoured.
- `src/app/owner/page.tsx` already refuses to list customers, and says so in its header
  comment.

**What is missing:** there is no Super Admin sign-in page. `guards.ts` references
`OWNER_SIGN_IN_PATH = "/owner/sign-in"`, and that route does not exist. The seeded
platform account (`myproducts385@gmail.com`, status `INVITED`) therefore has no way to
sign in at all. Brief §11 now formally requires this route.

---

## 3. Schema blockers

### 3.1 `users_one_org_owner_idx` must be dropped

```sql
CREATE UNIQUE INDEX users_one_org_owner_idx
  ON users (organization_id) WHERE role = 'ORG_OWNER';
```

Enforces **exactly one** `ORG_OWNER` per organization. The merged model has many admins
per organization, so this index makes the change impossible until dropped. Dropping it
also removes the guarantee that every organization has an identifiable principal — see
open question Q3.

### 3.2 PostgreSQL cannot remove an enum value

`tenant_role` is `('ORG_OWNER', 'ADMIN', 'CUSTOMER')`.

- `CUSTOMER` → `USER` is clean: `ALTER TYPE tenant_role RENAME VALUE 'CUSTOMER' TO 'USER'`
  (one statement, no table rewrite).
- `ORG_OWNER` → `ADMIN` is **not** a rename — two values collapse into one. It needs a
  data backfill (`UPDATE users SET role = 'ADMIN' WHERE role = 'ORG_OWNER'`), after which
  `ORG_OWNER` remains in the enum permanently as an unused tombstone unless the type is
  recreated.

CLAUDE.md invariant 6 and ADR-006 constrain how this is sequenced: the runner wraps each
file in one transaction and PostgreSQL forbids *using* a newly added enum value before
that transaction commits. **Add a value in one migration, use it in a later one.**

### 3.3 The deploy window is the real risk, not the SQL

Railway runs `npm run migrate` as `preDeployCommand` — migrations apply **before** the new
container serves traffic, while the old container is still running. A bare rename would
leave old code reading `CUSTOMER` against an enum that no longer has it.

The safe sequence is three deploys, not one:

1. **Migration A** — add `USER` to the enum. Deploy code that *accepts both* `CUSTOMER`
   and `USER`.
2. **Migration B** — backfill `ORG_OWNER` → `ADMIN` and `CUSTOMER` → `USER`; drop
   `users_one_org_owner_idx`. Deploy code that *writes only* the new values.
3. **Migration C** (optional, later) — recreate `tenant_role` without the dead values.

Doing it in one migration works on an empty database and breaks a live one.

### 3.4 Status enums do not line up

| Brief §8 wants | Schema has | Note |
|---|---|---|
| `INVITED` | `INVITED` | matches |
| `ACTIVE` | `ACTIVE` | matches |
| `SUSPENDED` | `SUSPENDED` | matches |
| `DEACTIVATED` | `DISABLED` | rename, or map |
| — | `LOCKED` | automatic, from repeated failed auth. **Keep** — it is not a synonym for suspended. |
| — | `PENDING` | "self-registered via join code, awaiting approval". Becomes dead once access requests own that lifecycle. |

Brief §8 says do not mix account status with access-request status. Agreed — and note
that `account_status.PENDING` already *is* the mixing it warns about. It should be retired
rather than reused for access requests.

---

## 4. Rank rules break in a way that is easy to miss

`canActOn` requires the actor to **strictly** outrank the target:

```ts
if (rankOf(actor.role) <= rankOf(target.role)) return deny("INSUFFICIENT_RANK");
```

Today `ORG_OWNER` (30) can act on `ADMIN` (20). After the merge every admin is a peer, so
**no admin can suspend, deactivate, or change the role of another admin.** Brief §2 lists
"Suspend/deactivate users" as an Admin capability; whether "users" includes fellow admins
is unstated. **This needs a decision (Q1).**

`canAssignRole` resolves more cleanly: strict rank means `ADMIN` cannot grant `ADMIN`,
and brief §1 assigns "Create/provision organization Admins" to Super Admin. Those agree —
admins are created by Super Admin, not by other admins. No change needed, but it should be
stated so nobody "fixes" the apparent gap.

---

## 5. The access-request system conflicts with an existing, reasoned decision

Brief §4 puts an **Organization** field on a public form. `001_foundation.sql` already
reasoned about exactly this, in the comment on `organizations.join_code`:

> NULL by default and globally unique when set: signup targets a tenant by code, never by
> choosing from a public list of organizations. **A public dropdown would publish the
> customer list** and let anyone queue a PENDING row against any tenant they can see.

A dropdown of organizations on a public page publishes your tenant list — which studios
use Adira — to anyone. Three viable resolutions, none free:

| Option | Trade-off |
|---|---|
| **Free-text organisation name** | No list published. Admin must match text to their org manually; requests arrive unroutable and need a Super Admin triage queue. |
| **Per-organisation request URL** (`/request-access/<slug>`) | Clean routing, no list published. The slug is guessable, so a request can still be aimed at a known org — acceptable, since submitting a request grants nothing. |
| **Reuse `join_code`** | Already designed for this and already in the schema. Highest friction: the applicant must be given a code out of band, which partly defeats a *public* request form. |

**Recommendation: per-organisation request URL**, with free-text org name only on a
generic `/request-access` fallback that lands in a Super Admin triage queue. This needs a
decision (Q2).

### Rate limiting needs a small extension

`AuthAction` is a closed union — `"otp.issue" | "otp.verify" | "passkey.authenticate"` —
with a matching `POLICIES` record. Access-request submission needs a fourth member and its
own budget. Small, but the limiter is fail-closed by design and silently forgetting this
would leave the public form unlimited.

Duplicate handling (brief §4) needs a partial unique index — one open `PENDING` request
per (organization, email) — rather than an application-level check, which races.

---

## 6. Routes

| Brief §11 | Today | Action |
|---|---|---|
| `/sign-in` | exists | keep |
| `/dashboard` | exists | keep |
| `/admin/dashboard` | `/admin` | alias or move |
| `/admin/login` | — | **see below** |
| `/super-admin/dashboard` | `/owner` | rename |
| `/super-admin/login` | — | **build — this is a real gap** |

**`/admin/login` should not be built.** Admins and users are the same rows in `users`,
authenticated by the same cookie and the same OTP/passkey flow. A separate admin login
page implies a second authentication path, which brief §16 forbids ("Do not create a
parallel authentication system"). One `/sign-in` that routes by role after authentication
gives the same result with no duplicated surface, and avoids a login page that reveals
which addresses are admins. **Recommend rejecting this item of §11 (Q4).**

`/super-admin/login` is genuinely required and genuinely missing — it is a separate
identity domain with its own cookie and table, so a separate page is correct there.

---

## 7. Blast radius

- **72 references** to `ORG_OWNER` across `src/`, `tests/`, `scripts/`, `migrations/`.
- **12 source files** reference it, including `permissions.ts`, `roles.ts`,
  `caseload.ts`, `analytics.ts`, `users.ts`, and four page components.
- **Existing tests encode the current model** — `tests/caseload-scope.test.ts` and
  `tests/tenant-isolation.test.ts` both assert `ORG_OWNER` behaviour and will need
  rewriting, not just renaming.
- **5 migrations applied** (`001`–`005`); the next is `006`.

## 8. Production data — small, but with one trap

```
organizations             1
users                     ORG_OWNER ACTIVE 1 · ADMIN ACTIVE 1 · CUSTOMER ACTIVE 2
owner_accounts            1  (INVITED — cannot sign in, no route)
consultant_assignments    1
```

Migration volume is trivial. **The trap:** the single `ORG_OWNER` is the user's own
account, and it holds no `consultant_assignments`. Under the merged model, if member data
stays assignment-scoped (§1), that account becomes an `ADMIN` **with no assigned members**
and immediately loses sight of every customer it can currently see.

The migration must therefore either create assignments for migrated owners, or the new
ADR must grant an explicit organization-wide capability for member *administration* that
does not depend on assignments. This is not hypothetical — it will happen on the first
deploy, to the only real account in the system.

Note also that 3 of the 4 users are test fixtures (`demo.*@adira.test`) left in production
by an earlier misconfiguration, and should be cleaned up before or during this work.

---

## 9. What must not change

| Invariant | Why it survives this change |
|---|---|
| ADR-001 — two identity domains | Super Admin separation *is* this decision. Strengthened, not weakened. |
| ADR-004 — tenant scope from session | Unaffected; still the whole multi-tenancy guarantee. |
| ADR-005 — SQL only in repositories | Access-request queries go in a new repository, not a route. |
| ADR-006 — forward-only migrations | Governs the three-step sequence in §3.3. |
| ADR-011 — domain-keyed session tokens | Unaffected. |
| ADR-012 — organization resolved after verification | Unaffected, and the access-request form must not become a new enumeration oracle. |
| Existing auth (OTP + passkeys + sessions) | **Reuse.** Brief §16 is explicit; nothing here needs a new credential type. |

---

## 10. Open questions — need a human decision before implementation

**Q1. Can an ADMIN suspend, deactivate, or change the role of another ADMIN?**
Strict rank currently says no, and after the merge that means admins cannot administer
each other at all. Options: (a) keep strict rank, Super Admin handles admin lifecycle;
(b) relax to `<` for a named subset of actions; (c) keep a senior tier under a different
name. Recommendation: (a) — it preserves the rank invariant and matches §1, which already
gives Super Admin the admin-provisioning duty.

**Q2. How does a public access request target an organisation without publishing the
tenant list?** See §5. Recommendation: per-organisation request URL.

**Q3. Must every organisation still have exactly one identifiable principal?** Dropping
`users_one_org_owner_idx` removes that guarantee. An organisation whose only admin is
suspended becomes unadministrable except by Super Admin. Recommendation: enforce
"at least one ACTIVE admin per organisation" at the service layer on suspend/deactivate.

**Q4. Is `/admin/login` genuinely wanted?** See §6. Recommendation: no — route by role
after one shared sign-in.

**Q5. Does `join_code` survive?** Access requests overlap it. Recommendation: keep the
column, stop treating it as a signup route, retire it in a later ADR rather than dropping
a column that costs nothing.

**Q6. Should `assessAttention` be audited against brief §23?** Brief §23 forbids clinical
judgement in "Needs Attention". `docs/METRICS.md` already flags `assessAttention` as
`[proposed]` and awaiting confirmation. Its current signals should be reviewed against
§23's list before this work closes — likely a small change, but it is a claim about a
person's health and deserves the check.

---

## 11. Proposed sequencing

Each step ships independently and leaves the system working. No step is started before
Q1–Q4 are answered.

| # | Story | Depends on |
|---|---|---|
| 0 | ADR-013: merged ADMIN, administrative vs data reach, migration strategy | Q1, Q2, Q3 |
| 1 | `US-SUPERADMIN-LOGIN` — build the missing `/super-admin/login`; closes a live gap | — |
| 2 | Migration 006: add `USER` to enum; code accepts both values | 0 |
| 3 | Migration 007: backfill roles, drop `users_one_org_owner_idx`, seed assignments for migrated owners | 2 |
| 4 | `US-RBAC-ROLE-SEPARATION` — rank rules, `hasOrganizationWideReach`, guards, tests rewritten | 3 |
| 5 | `US-AUTH-ACCESS-REQUEST` — `access_requests` table, public form, rate limiting, duplicate handling | 0 |
| 6 | `US-ADMIN-APPROVE-USER` / `US-ADMIN-REJECT-USER` — review screen, approve creates `INVITED` account | 5 |
| 7 | `US-ADMIN-CREATE-USER` — direct provisioning, reusing the same activation path | 6 |
| 8 | `US-USER-OWN-DATA` — the §19 security suite, run against a **throwaway** database | 4 |
| 9 | `US-SUPERADMIN-MANAGE-ORGANIZATION` — organisation lifecycle from the Super Admin console | 1 |

**Blocking prerequisite for step 8:** the §19 security tests are integration tests. They
cannot be run today, because `SQL_TEST_DATABASE_URL` points at the production database and
`tests/helpers/sql-db.ts` runs `TRUNCATE` on every table. A staging database must be
migrated and given a public proxy first, or these tests cannot be executed at all —
and brief §24 and §25 both require them to pass before this work is done.

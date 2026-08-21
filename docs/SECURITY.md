# Security

Adira holds health information about identifiable people, segregated by organization.
The two failures that matter most are a customer reading another customer's record, and
one organization reading another's.

We do not claim the system is unbreakable. The goal is secure by design, least privilege,
auditable, and containable.

## Threat model

| Threat | Primary control |
|---|---|
| Customer reads another customer | ownership check before every read; session-derived scope |
| Organization reads another organization | session-derived `organization_id`; composite FKs in the schema |
| Consultant reads an unassigned customer | `consultant_assignments` lookup; `ADMIN` is not org-wide |
| Privilege escalation | strict rank rules; `PLATFORM_OWNER` ungrantable through the tenant surface |
| Session theft | opaque tokens, hash-at-rest, `HttpOnly`+`Secure`, revocation |
| Credential stuffing | passkeys primary; OTP rate-limited per account and per IP |
| Tenant/platform confusion | separate tables, cookies, and secrets; boot fails if secrets match |
| SQL injection | parameterised SQL only; lint blocks raw pool access outside repositories |
| Malicious upload | server-side type and size validation; ImageKit never trusts the client (Phase 12) |
| Secret leakage | env validation names keys and never echoes values; audit log excludes secrets |

## In place after Phase 0

- **Environment validated at boot** (`src/lib/env-schema.ts`). Every key checked at
  startup; a deploy with a missing secret fails as a deploy. Verified: removing
  `SESSION_SECRET` fails `npm run build` with exit 1.
- **Two identity domains** with separate tables, cookies, and secrets. Boot refuses
  identical secrets.
- **Rank rules** (`canActOn`, `canAssignRole`), strict, pure, and exhaustively tested.
- **Database-level tenant isolation** via composite foreign keys.
- **Session tokens hashed at rest**; schema has no column for a plaintext token.
- **Append-only `audit_logs`** with a partial index on `outcome = 'DENIED'`.
- **Security headers** on every response (`next.config.ts`): `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- **Lint-enforced layer boundary** — the raw pool cannot be imported outside
  repositories.
- **CI** running lint, typecheck, tests, and build on every push and PR.

## Deliberately not yet in place

Listed here so they are visible rather than assumed.

| Gap | Owner |
|---|---|
| **Content-Security-Policy** | Phase 16 |
| Rate limiting | Phase 2 (auth paths), Phase 16 (general) |
| Cross-tenant / IDOR / BOLA test suites | Phase 3 |
| Upload validation and signed media access | Phase 12 |
| Dependency scanning in CI | Phase 16 |
| Backup and restore rehearsal | Phase 18 |

### Why no CSP yet

A real policy needs a nonce threaded through the App Router's script tags and needs to
know which external origins the product actually uses — ImageKit in Phase 12, the 3D
asset host in Phase 15. Writing one now yields either a policy so loose it certifies
nothing, or a strict one that breaks the moment Phase 12 lands and gets hastily loosened.
Phase 16 owns it. The absence is recorded rather than papered over.

## Rules

1. **Never trust a client-supplied identifier for scope.** Organization comes from the
   session. An endpoint accepting an organization id is a bug.
2. **Authorize before querying**, not after. Filtering results the caller should never
   have retrieved still means the row was read, and a timing difference still leaks
   existence.
3. **Never log a secret.** Not in `audit_logs`, not in an error message, not in console
   output. Env errors name the key and never the value.
4. **Never expose a constraint name to a user.** Constraint names leak schema structure;
   on a multi-tenant system that is free reconnaissance. Log it, do not render it.
5. **Uniform responses on authentication paths.** Unknown address and wrong credential
   respond identically. See `docs/AUTHENTICATION.md`.
6. **Exports must never contain** credentials, OTP values, session tokens, or another
   tenant's data.

## Audit logging

`audit_logs` is append-only — no `updated_at`, no update path. Records who did what to
which resource, with `outcome` of `SUCCESS`, `FAILURE`, or `DENIED`.

`DENIED` is the security signal. `CROSS_ORGANIZATION` and `UNGRANTABLE_ROLE` denials mean
someone is probing a boundary; the partial index on `outcome = 'DENIED'` exists so that
is cheap to watch.

## Reporting

No public disclosure process yet — the product has no users. Phase 18 owns it before any
real customer data exists.

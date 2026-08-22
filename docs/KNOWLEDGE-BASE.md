<!--
  SOURCE DOCUMENT — the user's own words. Do not edit to reflect implementation.

  Provenance: "Yoga Therapy & Wellness Platform — Master Knowledge Base v2.0",
  supplied 2026-08-22. Reproduced verbatim below.

  This file answers WHAT the product must be. It is the authority on product intent.
  - HOW the work is planned and executed: /BMAD/BMAD-PLAN.md
  - Which layer owns which knowledge: docs/KNOWLEDGE-MAP.md
  - Register of every source document supplied: docs/SOURCE-DOCUMENTS.md

  Where this document and the code disagree, the code wins for "what the system does"
  and this document wins for "what it is supposed to do". Resolve the conflict
  explicitly and record it — never let it sit.
-->

# Yoga Therapy & Wellness Management Platform
## Master Knowledge Base v2.0

**Status:** Greenfield / Build from zero  
**Current deployment:** Railway  
**Primary stack:** Next.js + TypeScript + Tailwind CSS + shadcn/ui + PostgreSQL + WebAuthn/Passkeys + OTP + ImageKit  
**Purpose:** Single source of truth for product, architecture, security, UX, development, deployment, and future roadmap.

---

# 1. Product Vision

Build a premium, secure, multi-tenant Yoga Therapy & Wellness Management SaaS.

**Customer → Personalized Yoga + Diet Plans → Daily Activities → Check-ins → Consultant/Admin Review → Progress/Results → Notifications → Weekly Reports**

The Owner receives a separate executive experience for organization-wide analytics, consultant performance, customer metrics, operational reporting, and management.

This is a real commercial product, not a prototype or static dashboard.

---

# 2. Core Product Principles

- Real production data must come from PostgreSQL.
- Backend controls authentication, authorization, validation, ownership, organization scope, business rules, imports, exports, notifications, and reporting.
- Customers can access only their own authorized records.
- Organizations cannot access each other's data.
- Owner, Admin/Consultant, and Customer have distinct portals and permissions.
- Security uses WebAuthn/Passkeys, OTP protection, secure sessions, rate limiting, audit logs, secure headers, validation, and authorization tests.
- Use shadcn/ui + Tailwind with centralized design tokens.
- Railway is the current deployment platform; keep the architecture portable.
- ImageKit handles media; private credentials stay server-side.
- Build a responsive PWA where supported.
- Documentation is part of the product and must evolve with architecture.

---

# 3. Roles

## Owner
- Separate login/dashboard
- Organization analytics
- Consultant/admin management
- Customer statistics
- Performance analytics
- Weekly/monthly reports
- Operational alerts
- Organization settings
- Authorized customer overview
- Step-up authentication for sensitive actions where appropriate

## Admin / Consultant
- Authorized customers
- Customer profiles
- Yoga programs
- Diet plans
- Daily activities
- Check-ins
- Progress
- Consultant notes
- Appointments
- Reports
- Customer notifications

## Customer
- Own profile
- Assigned yoga/diet plans
- Own activities and check-ins
- Own progress/reports
- Notifications
- Appointments
- Permitted profile fields

Customers cannot access other customers, Admin/Owner APIs, organization settings, or internal audit data.

---

# 4. Multi-Tenant Model

Platform → Organizations → Owners/Admins/Consultants/Customers.

Use `organization_id` on organization-scoped resources.

Never trust organization IDs supplied by clients. Derive scope from the authenticated session and enforce it in server-side queries.

Security invariant:

`authenticated organization == resource organization`

---

# 5. Master Technical Architecture

```text
USERS
  |
  +--> CUSTOMER
  +--> ADMIN / CONSULTANT
  +--> OWNER
  |
  v
NEXT.JS WEB APPLICATION
(TypeScript + Tailwind + shadcn/ui)
  |
  v
AUTHENTICATION
  +--> WebAuthn / Passkeys
  +--> OTP
  |
  v
SECURE SERVER SESSION
  |
  v
AUTHORIZATION / RBAC
  |
  v
VALIDATION
  |
  v
BACKEND SERVICES
  |
  +--> Customer Service
  +--> Program Service
  |      +--> Yoga
  |      +--> Diet
  +--> Activity Service
  +--> Reporting
  +--> Notifications
  +--> Import / Export
  +--> Media
  |
  v
REPOSITORY / DATA ACCESS
  |
  v
RAILWAY POSTGRESQL

Supporting:
ImageKit -> private media
Optional Redis/worker -> async jobs
```

Frontend must never connect directly to PostgreSQL.

---

# 6. Technology Stack

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- React Hook Form where appropriate
- Zod
- PostgreSQL
- Railway PostgreSQL
- WebAuthn / Passkeys
- OTP
- Secure server-side sessions
- ImageKit
- Git/GitHub
- Unit, integration, E2E and security testing

Add Redis/workers only when actual workload requires them.

---

# 7. Authentication

Use real authentication; never hardcode credentials or use mock login.

## WebAuthn / Passkeys
Support device/platform authenticators such as:
- Fingerprint
- Face authentication
- Windows Hello
- Device passkeys
- Security keys where supported

Never store raw biometric data.

## OTP
Use for:
- Activation
- Fallback
- Recovery
- New-device verification
- Appropriate step-up authentication

OTP must have:
- Expiration
- Attempt limits
- Rate limiting
- Replay prevention
- Abuse protection

Never log or expose raw OTP values.

---

# 8. Session Security

Use secure server-side sessions and appropriate `HttpOnly`, `Secure`, and `SameSite` cookie settings.

Implement:
- Session creation
- Expiration
- Logout
- Revocation
- Reauthentication for sensitive operations
- Session/device management where appropriate

Never expose database credentials, auth private secrets, ImageKit private keys, OTP provider secrets, or server secrets to client code.

---

# 9. Authorization

Every protected request:

```text
Authenticated User
 -> Role
 -> Organization
 -> Resource Ownership
 -> Permission
 -> Authorized Query
```

Prevent IDOR, BOLA, privilege escalation, cross-tenant access, and customer-to-customer access.

Example:
- Customer A requesting Customer A → allowed
- Customer A requesting Customer B → 403 Forbidden

Apply the same protection to profiles, activities, yoga, diet, progress, reports, appointments, notifications, media, imports and exports.

Hiding UI elements is not authorization.

---

# 10. Database

Railway PostgreSQL is the source of truth.

Recommended entities:

- organizations
- users
- roles
- permissions
- user_roles
- owner_accounts
- consultants
- customers
- customer_profiles
- sessions
- passkey_credentials
- otp_challenges
- assessments
- progress_records
- yoga_programs
- yoga_exercises
- yoga_program_exercises
- customer_yoga_programs
- diet_programs
- diet_meals
- diet_program_meals
- customer_diet_programs
- daily_activities
- activity_completions
- daily_checkins
- appointments
- consultation_notes
- notifications
- notification_preferences
- push_subscriptions
- weekly_reports
- monthly_reports
- media_assets
- imports
- exports
- audit_logs

Use migrations, foreign keys, unique constraints, indexes, transactions, timestamps and organization scoping.

Never use fake production dashboard data.

---

# 11. Backend Architecture

```text
API Route
 -> Authentication Middleware
 -> Authorization Middleware
 -> Validation
 -> Controller / Route
 -> Service / Domain Logic
 -> Repository / Data Access
 -> PostgreSQL
```

Business rules belong in services/domain logic. Database access belongs in repositories.

Backend controls:
- Authentication
- Authorization
- Ownership
- Organization isolation
- Activity state
- Plan assignment
- Reporting
- Imports
- Exports
- Media authorization
- Notifications
- Audit events

---

# 12. Frontend Architecture

Suggested route groups:

```text
app/
├── (public)/
├── (auth)/
├── customer/
│   ├── dashboard/
│   ├── profile/
│   ├── yoga/
│   ├── diet/
│   ├── activities/
│   ├── progress/
│   ├── appointments/
│   ├── reports/
│   └── notifications/
├── admin/
│   ├── dashboard/
│   ├── customers/
│   ├── customers/[id]/
│   ├── yoga/
│   ├── diet/
│   ├── activities/
│   ├── appointments/
│   ├── reports/
│   └── notifications/
└── owner/
    ├── login/
    ├── dashboard/
    ├── customers/
    ├── consultants/
    ├── analytics/
    ├── reports/
    └── settings/
```

All protected routes must be protected server-side.

---

# 13. Dashboards

## Customer
Show real data:
- Current program
- Journey day
- Today's yoga
- Today's diet
- Daily activities
- Completion
- Progress
- Weekly result
- Notifications
- Appointment
- 3D yoga guide

## Admin
Show:
- Active customers
- Pending/completed/missed activities
- Customers needing attention
- Yoga/diet adherence
- Consultant workload
- Appointments

When Admin opens Customer A, show only Customer A's authorized workspace:
Overview, Profile, Yoga, Diet, Activities, Check-ins, Progress, Appointments, Reports, Notifications, Consultant Notes.

## Owner
Show:
- Total/active/new customers
- Consultants
- Activity completion
- Yoga/diet adherence
- Engagement
- Retention
- Consultant performance
- Weekly/monthly reports
- Operational alerts

All counts and metrics must come from PostgreSQL.

---

# 14. Yoga Engine

Exercise library:
- Name
- Description
- Instructions
- Breathing guidance
- Duration
- Repetitions
- Difficulty
- Media
- 3D reference
- Status

Flow:

```text
Exercise Library
 -> Program Builder
 -> Customer Assignment
 -> Daily Schedule
 -> Activity
 -> Completion
 -> Adherence
 -> Reports
```

Lifecycle:
Assessment → Foundation → Breathing → Flexibility → Strength → Balance → Meditation → Maintenance.

3D references must not contain core business rules.

---

# 15. Diet Engine

Create:
- Food library
- Meal library
- Diet programs
- Customer assignments
- Schedules
- Adherence
- Plan history

Meals:
- Breakfast
- Lunch
- Snacks
- Dinner

Store appropriate meal details and keep plans database-driven.

---

# 16. Daily Activity Engine

Statuses:
- PENDING
- STARTED
- COMPLETED
- SKIPPED
- MISSED
- REVIEW_REQUIRED

Activity fields:
- id
- organization_id
- customer_id
- program_id
- activity_type
- scheduled_at
- started_at
- completed_at
- duration
- status
- notes
- created_at
- updated_at

Flow:

Assigned → Scheduled → Started → Performed → Completed → Recorded → Reviewed → Reported

---

# 17. Daily Check-In

Provide a simple check-in for:
- Mood
- Sleep
- Water
- Yoga adherence
- Diet adherence
- General notes

Collect only information necessary for the product.

---

# 18. Reporting

Generate:
- Customer weekly report
- Consultant/customer performance report
- Owner organization report
- Monthly reports

Metrics:
- Yoga adherence
- Diet adherence
- Activity completion
- Check-in consistency
- Missed activities
- Engagement
- Progress trends

Use background processing for expensive/PDF reports.

---

# 19. Notifications

Channels:
- In-app
- Push
- Email
- Optional SMS

Events:
- Yoga reminder
- Diet reminder
- Activity reminder
- Missed activity
- Plan update
- Consultant message
- Report ready
- Appointment reminder
- Activity result
- Weekly progress

Tables:
- notifications
- notification_preferences
- push_subscriptions

Support read/unread, mark read, mark all read, and preferences.

Admins can send results/messages only to authorized customers.

---

# 20. ImageKit

Use ImageKit for media.

Flow:

```text
User
 -> Backend
 -> Authenticate + Authorize
 -> Temporary Upload Authorization
 -> ImageKit
 -> PostgreSQL metadata
```

Never expose ImageKit private credentials.

Store media ownership and organization context in PostgreSQL.

Use private/signed delivery for sensitive media where appropriate.

---

# 21. Import / Export

## Import

```text
CSV
 -> Parse
 -> Validate
 -> Preview
 -> Confirm
 -> Transaction
 -> PostgreSQL
```

Show valid rows, invalid rows, duplicates, warnings and errors.

## Export

```text
Request
 -> Authorization
 -> Authorized Query
 -> Generate CSV
 -> Private Temporary File
 -> Download
```

Never export passwords, OTP secrets, session tokens or authentication secrets.

Large exports should be asynchronous.

---

# 22. PWA / Install

Build as an installable Progressive Web App where supported.

Target:
- Android
- iOS/iPadOS
- Windows
- macOS
- Tablets
- Desktop browsers

Create:
- manifest.webmanifest
- Icons
- PWA metadata
- Service worker where appropriate
- Install experience

Do not cache sensitive customer data indiscriminately.

---

# 23. Branding

Use the approved platform logo for:
- Website header
- Login
- Dashboards
- Favicon
- PWA icons
- Reports
- Notifications
- Loading/splash experience

Favicon should be symbol-only.

---

# 24. Premium UI/UX

Use shadcn/ui + Tailwind.

Visual direction:
- Deep botanical green
- Sage/olive
- Warm ivory/sand
- Muted terracotta
- Subtle saffron
- Deep charcoal

Feeling:
Premium, calm, natural, modern, trustworthy, professional.

Use centralized design tokens and purposeful animation. Avoid excessive glassmorphism.

Dialogs/forms must include:
- Clear title/description
- Validation
- Loading/error/success states
- Cancel
- Destructive confirmation
- Keyboard accessibility
- Focus management
- Mobile responsiveness

---

# 25. Responsive Design

Mobile-first and usable on:
- Android
- iOS/iPadOS
- Windows
- macOS
- Tablets
- Desktop monitors

Requirements:
- Touch-friendly
- Keyboard accessible
- Responsive navigation
- Responsive tables
- Responsive dialogs
- No critical hover-only interactions
- 3D fallback for low-powered devices

---

# 26. Internationalization

Use proper i18n and translation keys.

Initial language: English.

Architecture ready for:
- Telugu
- Hindi
- Kannada
- Tamil
- Malayalam
- Future languages

Persist user locale.

Google Translation may be integrated through a controlled backend integration for approved non-sensitive content.

Never send sensitive customer information to an external translation service without an approved privacy/data-sharing basis.

Human-review important yoga/diet instructions.

---

# 27. Security

Defense in depth:
- WebAuthn/passkeys
- OTP security
- Secure sessions
- Rate limiting
- Brute-force protection
- Input validation
- SQL injection protection
- XSS protection
- CSRF protection where applicable
- CORS restrictions
- CSP
- Security headers
- File validation
- Secrets management
- Audit logs
- Dependency scanning
- Cross-tenant tests
- IDOR/BOLA tests
- Backup/restore tests

Do not claim “hack-proof.” The goal is secure-by-design, least privilege, detection, monitoring, containment and regular testing.

---

# 28. Audit Logging

Log:
- Login/failed login/logout
- Passkey registration/removal
- OTP events without values
- Profile changes
- Plan changes
- Activity changes
- Permission changes
- Imports/exports
- Reports
- Notifications
- Privileged actions

Never log secrets.

---

# 29. Railway

Current deployment target: Railway.

Use:

```text
STAGING
- Application
- PostgreSQL

PRODUCTION
- Application
- PostgreSQL
```

Use Railway Variables for secrets.

Never use the production DB for local development.

Add Redis/worker only when justified.

---

# 30. CI/CD

```text
Git
 -> Pull Request
 -> Lint
 -> Typecheck
 -> Unit Tests
 -> Integration Tests
 -> Security Tests
 -> Build
 -> Railway Staging
 -> Smoke Tests
 -> Production
```

Production releases must be traceable and reproducible.

---

# 31. Testing

Test:
- Authentication
- Authorization
- Customer isolation
- Organization isolation
- Owner access
- Admin access
- Yoga
- Diet
- Activities
- Reports
- Notifications
- ImageKit
- Import/export
- PWA
- Responsive UI
- Accessibility

Critical tests:
1. Customer A cannot access Customer B.
2. Organization A cannot access Organization B.
3. Customer cannot access Admin APIs.
4. Customer cannot access Owner APIs.
5. Admin cannot access unauthorized customers.
6. Export cannot exceed authorization scope.
7. Media cannot be accessed through another user's resource ID.

---

# 32. Development Roadmap

1. **Foundation:** Next.js, TypeScript, Tailwind, shadcn/ui, design tokens, docs, tests.
2. **Database:** Railway PostgreSQL, schema, migrations, repositories.
3. **Authentication:** WebAuthn/Passkeys, OTP, sessions, recovery.
4. **Authorization:** RBAC, organization isolation, ownership, security tests.
5. **Backend:** services, repositories, APIs, validation, errors.
6. **Customer:** profile, dashboard, check-in, activities, progress.
7. **Yoga:** exercise library, programs, assignments, scheduling.
8. **Diet:** food/meal library, programs, assignments, adherence.
9. **Admin:** dashboard, customers, customer workspace, plan assignment, review.
10. **Owner:** separate login, dashboard, analytics, performance, reports.
11. **Notifications:** in-app, push, email, admin messaging.
12. **Reports:** weekly/monthly reporting and PDF generation.
13. **ImageKit:** upload authorization, media metadata, private media.
14. **Import/Export:** CSV import, validation, export, authorization.
15. **PWA:** manifest, icons, install experience, safe caching.
16. **3D:** yoga character, pose animation, lifecycle, fallback.
17. **Security:** hardening, scanning, authorization testing, backups.
18. **Performance:** load testing, accessibility, browser/mobile testing.
19. **Production:** Railway staging, smoke tests, production deployment, monitoring.

---

# 33. Claude Code Execution Protocol

Claude is the coding agent. The repository Knowledge Base is the source of truth.

For every meaningful task:

```text
READ
 -> UNDERSTAND
 -> INSPECT
 -> PLAN
 -> IMPLEMENT
 -> TEST
 -> SECURITY REVIEW
 -> BUILD
 -> DOCUMENT
 -> REPORT
```

Claude must:
1. Read `CLAUDE.md`.
2. Read relevant `/docs`.
3. Inspect current implementation.
4. State the plan and affected modules.
5. Implement only intended scope.
6. Run tests.
7. Run typecheck.
8. Run lint.
9. Run production build.
10. Review security.
11. Update docs/ADRs when needed.
12. Report changed files, verification, deployment impact, and remaining risks.

Never bypass auth, authorization, security, or real database requirements.

---

# 34. Repository Documentation

```text
/CLAUDE.md

/docs/
  KNOWLEDGE-BASE.md
  ARCHITECTURE.md
  SECURITY.md
  AUTHENTICATION.md
  RBAC.md
  DATABASE.md
  YOGA.md
  DIET.md
  ACTIVITY.md
  REPORTING.md
  NOTIFICATIONS.md
  IMAGEKIT.md
  PWA.md
  RAILWAY.md
  TESTING.md
  ROADMAP.md

/decisions/
  ADR-001-authentication.md
  ADR-002-database.md
  ADR-003-multitenancy.md
  ADR-004-railway.md
```

Architectural changes require an ADR with Context, Decision, Alternatives, Consequences, and Date.

---

# 35. Definition of Done

A feature is complete only when:
- UI works
- Backend works
- Database works
- Authentication works
- Authorization works
- Validation works
- Error handling works
- Loading state works
- Empty state works
- Success state works
- Mobile works
- Desktop works
- Tests pass
- Typecheck passes
- Lint passes
- Production build passes
- Security implications are reviewed
- Documentation is updated

---

# 36. Master Execution Loop

```text
Knowledge Base
 -> Requirements
 -> Architecture
 -> Task Plan
 -> Implementation
 -> Testing
 -> Security Review
 -> Railway Staging
 -> Verification
 -> Production
 -> Monitoring
 -> Feedback
 -> Knowledge Base Update
```

---

# 37. Final Product Experience

## Customer

```text
LOGIN
 -> Passkey / OTP
 -> Personal Dashboard
 -> Today's Yoga
 -> Today's Diet
 -> Daily Activity
 -> Completion
 -> Progress
 -> Result
 -> Notification
 -> Weekly Report
```

## Admin

```text
ADMIN LOGIN
 -> ADMIN DASHBOARD
 -> CUSTOMERS
 -> CUSTOMER A
 -> Customer-Specific Workspace
 -> Yoga / Diet / Activity / Progress
 -> Review
 -> Update Plan
 -> Send Notification
```

## Owner

```text
OWNER LOGIN
 -> OWNER DASHBOARD
 -> Organization Analytics
 -> Consultant Performance
 -> Customer Metrics
 -> Reports
 -> Business Overview
```

---

# 38. Future Roadmap

After the core platform is stable:
- Native Android
- Native iOS
- Wearable integrations
- Advanced 3D yoga
- Camera-based pose detection
- AI-assisted summaries
- Advanced analytics
- Subscription/billing
- Video consultations
- Additional notification channels
- Larger-scale infrastructure if needed

AI must not replace professional judgment for health-related decisions. Automated insights should be appropriately bounded and reviewed where necessary.

---

# 39. Final Production Acceptance Gate

Before declaring production-ready:
- Real Railway PostgreSQL
- Real backend
- Real authentication
- WebAuthn/Passkeys
- OTP
- Secure sessions
- RBAC
- Organization isolation
- Customer isolation
- Real dashboard counts
- Yoga engine
- Diet engine
- Activity engine
- Admin workspace
- Owner portal
- Notifications
- Weekly reports
- ImageKit
- Import/export
- PWA installation
- Responsive mobile/desktop
- Premium shadcn/Tailwind UI
- Accessibility review
- Security tests
- Backup/restore test
- Railway staging verification
- Production deployment process
- Monitoring
- Documentation

The platform is successful only when the complete customer, admin, and owner flows work using real data with secure authorization.

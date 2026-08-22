# BMAD Master Plan

## Project
Yoga Therapy & Wellness Management Platform

## Status
Greenfield / Build from zero

## Core rule
The Knowledge Base defines WHAT to build.
BMAD defines HOW to plan and execute the build.

## Phase 1 — Analysis
Create:
- PRODUCT-CONTEXT.md
- Problem statement
- Target users
- User journeys
- Business goals
- Product boundaries
- Risks
- Assumptions

## Phase 2 — Product
Create:
- PRD.md
- Functional requirements
- Non-functional requirements
- Security requirements
- Acceptance criteria
- User stories

## Phase 3 — UX
Create:
- UX-SPECIFICATION.md
- Design system
- Customer experience
- Admin experience
- Owner experience
- Responsive behavior
- Accessibility
- Dialog/form standards
- PWA install experience
- 3D yoga experience

## Phase 4 — Architecture
Create:
- ARCHITECTURE.md
- DATABASE.md
- API.md
- SECURITY.md
- AUTHENTICATION.md
- RBAC.md
- RAILWAY.md

## Phase 5 — Epics & Stories
Create epics:
1. Foundation
2. Authentication
3. Authorization
4. Multi-tenancy
5. Customer
6. Yoga
7. Diet
8. Activities
9. Admin
10. Owner
11. Notifications
12. Reporting
13. ImageKit
14. Import/Export
15. PWA
16. 3D
17. Security
18. Testing
19. Deployment

Every story must contain:
- User story
- Context
- Requirements
- Acceptance criteria
- Security considerations
- Database/API impact
- Test requirements
- Definition of done

## Phase 6 — Implementation
Implement one approved story at a time.

Story loop:
READ
→ PLAN
→ IMPLEMENT
→ TEST
→ SECURITY REVIEW
→ BUILD
→ DOCUMENT
→ REPORT

## Phase 7 — Testing & Review
Verify:
- Unit tests
- Integration tests
- E2E tests
- Authorization tests
- Cross-tenant isolation
- IDOR/BOLA
- Responsive UI
- Accessibility
- Production build

## Phase 8 — Deployment
Railway:
- Staging
- Smoke tests
- Production

Never use production DB for local development.

## Phase 9 — Retrospective
At the end of every major epic:
- What worked?
- What failed?
- What changed?
- Risks remaining?
- Improvements?
- Knowledge Base/ADR updates?

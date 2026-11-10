<!--
PROVENANCE — source document, stored verbatim. Do not edit to reflect what was built.
Supplied by the user in chat on 2026-11-10, as an implementation brief for Adira Wellness.
Registered in docs/SOURCE-DOCUMENTS.md. Reconciliation: docs/PLATFORM-UPGRADE-RECONCILIATION.md.
Everything below this comment is the user's text, unchanged.
-->

I'll structure this as a complete implementation prompt for Claude. It covers the tenant website builder, reusable templates, strong RBAC, yoga and team modules, dashboard metric alignment, consistent layouts, collapsible side panels, and Palette-inspired mobile bottom navigation.

The key requirement is that **all existing functionality and tenant data isolation must be preserved while the implementation is upgraded.**

# ADIRA WELLNESS — COMPLETE PLATFORM IMPLEMENTATION

## Main Objective

Upgrade the existing Adira Wellness platform into a polished, scalable, multi-tenant wellness SaaS platform.

This is an implementation task, not a mockup or prototype.

Implement the following areas:

1. Perfect dashboard metric alignment.
2. Advanced tenant website builder.
3. Multiple selectable tenant website templates.
4. Complete tenant website customization.
5. Sign-in functionality on tenant public websites.
6. Expanded Yoga management.
7. Expanded Team management.
8. Strong role-based access control (RBAC).
9. Consistent page spacing and padding.
10. Fix all sidebar and side-panel issues.
11. Responsive desktop, tablet and mobile layouts.
12. Collapsible side navigation.
13. Palette-inspired fixed mobile bottom navigation for primary actions.
14. Consistent Adira design system across every page.

**Do not implement only the frontend appearance. Every feature must work with the existing backend and database architecture.**

---

# PHASE 1 — AUDIT THE EXISTING APPLICATION

Before making changes, inspect the complete existing application.

Understand:

- Current architecture and framework.
- Existing multi-tenant structure.
- Tenant creation and management.
- Tenant website generation.
- Existing website settings.
- Existing templates, if any.
- Authentication and session handling.
- User roles and permissions.
- Database schema and migrations.
- Yoga modules.
- Team management.
- Dashboard metrics.
- Navigation and layouts.
- Responsive behavior.
- Existing API endpoints.
- Existing reusable components.

Create an implementation plan identifying:

- Existing functionality to preserve.
- Missing functionality.
- Components to improve.
- Components to reuse.
- Database changes genuinely required.
- Security risks.
- Potential regressions.

Do not rewrite the application architecture unnecessarily.

The existing production application is the source of truth.

# PHASE 2 — GLOBAL DESIGN SYSTEM

Follow the established Adira/Palette visual direction.

The design must be consistent across all platform areas.

### Visual direction

- Premium wellness design.
- Colorful Neo-Brutalist influence.
- Glassmorphism.
- Soft gradients.
- Organic decorative backgrounds.
- Colorful domain-specific icons.
- Strong typography.
- Clean spacing.
- Clear visual hierarchy.
- Smooth, subtle interactions.

### Main palette

| Purpose | Color |
|---|---|
| Primary green | #2AA704 |
| Secondary blue | #15A8EB |
| Tertiary red | #EF0E23 |
| Brand turquoise | #0CBDC8 |

Use supporting colors such as orange, yellow, lavender and pink.

Do not apply saturated colors indiscriminately. Maintain excellent text contrast.

### Shared components

Create or improve reusable components:

- AppHeader
- AppSidebar
- CollapsibleSidebar
- MobileBottomNavigation
- PageContainer
- PageHeader
- MetricCard
- MetricGrid
- SectionHeader
- GlassPanel
- GradientButton
- IconTile
- StatusBadge
- ResponsiveTable
- EmptyState
- ConfirmationDialog
- TenantWebsitePreview

All pages must use shared design tokens and layout components.

---

# PHASE 3 — PERFECT METRIC ALIGNMENT

This is a high-priority requirement.

Audit every dashboard and analytics page.

Metric cards must have consistent:

- Height.
- Width.
- Internal padding.
- Border radius.
- Icon alignment.
- Heading alignment.
- Number alignment.
- Description alignment.
- Vertical spacing.

### Metric grid behavior

Desktop:
- Use a consistent responsive grid.
- Four or five metrics per row when space permits.
- Equal-height cards.
- Consistent gaps.

Tablet:
- Two or three metrics per row depending on available width.

Mobile:
- One or two metrics per row.
- No horizontal overflow.
- Numbers must remain readable.

### Metric card structure

Each metric should have:

1. Label.
2. Icon.
3. Main value.
4. Supporting description.
5. Optional percentage or trend.
6. Optional comparison period.

Example metrics:

- Total Members.
- Active Members.
- New Members.
- Active Programmes.
- Yoga Sessions.
- Diet Plans.
- Team Members.
- Pending Requests.
- Completed Check-ins.
- Member Engagement.

### Metric alignment rules

- All metric cards in the same grid row must align.
- Large numbers must use consistent typography.
- Descriptions must not shift card heights unpredictably.
- Icons must have consistent dimensions.
- Long labels must wrap gracefully.
- Empty or unavailable metrics must have a consistent presentation.
- Avoid arbitrary fixed heights that cause text clipping.

Never fabricate metric values. Use actual database/API values and existing aggregation logic.

---

# PHASE 4 — ADVANCED TENANT WEBSITE BUILDER

This is one of the most important platform features.

Every tenant must be able to manage its own public website without affecting other tenants.

Create a dedicated website management area inside each tenant dashboard.

Suggested navigation:

Tenant Dashboard
- Overview
- Website
- Website Templates
- Website Editor
- Website Preview
- Website Settings
- Yoga
- Diet
- Members
- Team
- Reports
- Settings

Adapt this to existing routes rather than creating duplicate modules.

## 4.1 Website template gallery

Allow each tenant to select from multiple professionally designed website templates.

Create at least eight distinct templates.

Suggested templates:

**Template 1 — Wellness Minimal**
- Clean layout.
- White and mint surfaces.
- Elegant typography.
- Minimal navigation.

**Template 2 — Yoga Retreat**
- Emerald and turquoise.
- Yoga-focused visual sections.
- Class schedules.
- Instructor profiles.

**Template 3 — Modern Fitness**
- Strong typography.
- Bold green and blue.
- Programme highlights.
- Call-to-action sections.

**Template 4 — Holistic Wellness**
- Lavender and mint.
- Meditation and wellness content.
- Soft organic shapes.

**Template 5 — Nutrition Studio**
- Orange and yellow accents.
- Diet and nutrition services.
- Meal programme highlights.

**Template 6 — Premium Wellness**
- Dark navy and emerald accents.
- Premium typography.
- Elegant visual presentation.

**Template 7 — Community Wellness**
- Friendly colors.
- Team and community sections.
- Events and activities.

**Template 8 — Corporate Wellness**
- Professional layout.
- Programme information.
- Team and organizational content.

These must be genuinely different templates, not merely eight color variations of one page.

Every template must be responsive.

## 4.2 Template selection

The tenant admin should be able to:

- Browse templates.
- View template details.
- Preview desktop layout.
- Preview mobile layout.
- Select a template.
- Apply a template.
- Change templates later.
- Preview changes before publishing.

Changing a template must not delete existing tenant content.

Preserve content through a normalized content model and map it into the new template.

Provide a confirmation step before applying a different template.

## 4.3 Website editor

Build an intuitive website editor.

Allow tenants to edit:

**Branding**
- Business name.
- Logo.
- Favicon.
- Brand colors.
- Typography.
- Cover image.
- Contact details.

**Hero section**
- Main heading.
- Supporting description.
- Hero image.
- Primary CTA.
- Secondary CTA.

**About section**
- Business introduction.
- Mission.
- Wellness philosophy.

**Services**
- Yoga.
- Meditation.
- Pranayama.
- Diet consultation.
- Personal training.
- Wellness programmes.

**Team section**
- Instructor profiles.
- Team photos.
- Qualifications.
- Specializations.

**Programmes**
- Programme name.
- Description.
- Duration.
- Pricing, where enabled.
- Enrolment CTA.

**Contact**
- Phone.
- Email.
- Address.
- Google Maps location, where configured.
- Social media links.

**Footer**
- Business details.
- Navigation.
- Contact information.
- Social media.
- Copyright text.

Tenants should be able to enable or disable optional sections.

## 4.4 Live preview

Implement a website preview with:

- Desktop preview.
- Tablet preview.
- Mobile preview.

Use a preview state that reflects unsaved edits.

Provide:

- Save draft.
- Preview.
- Publish.
- Unpublish.
- Restore previous published version, if supported.

Do not automatically publish every edit.

Display the current publishing status clearly.

## 4.5 Tenant website isolation

Every website must belong to exactly one tenant.

The following must remain isolated:

- Website configuration.
- Template selection.
- Content.
- Images and assets.
- Branding.
- Published version.
- Website settings.

Tenant A must never be able to edit or view Tenant B's private website configuration.

Resolve the tenant through the existing trusted tenant-resolution architecture.

Never trust a tenant ID supplied by the browser without server-side authorization.

---

# PHASE 5 — TENANT PUBLIC WEBSITE SIGN-IN

Add a visible **Sign In** button to every tenant public website.

The button must be included in:

- Desktop header.
- Mobile navigation or mobile menu.

The sign-in experience should match the selected tenant template.

### Expected behavior

1. Customer opens the tenant's public website.
2. Customer selects Sign In.
3. Customer is taken to the tenant-aware authentication page.
4. Authentication is performed using the existing supported authentication system.
5. The server verifies the authenticated identity.
6. The server resolves and validates the tenant.
7. The user is allowed access only to the appropriate tenant account and permitted features.

### Important security rules

- Never trust the tenant ID from a URL or client request alone.
- Validate tenant membership server-side.
- Prevent cross-tenant login access.
- Preserve existing authentication and session security.
- Do not create a second independent authentication system.
- Do not expose private admin routes to public website visitors.

If the current product supports member registration or invitations, preserve the existing rules.

Do not introduce unrestricted self-registration unless it is an explicitly configured tenant feature.

The public website and tenant admin login must have clearly separated access paths.

---

# PHASE 6 — STRONG RBAC IMPLEMENTATION

Implement a proper centralized role-based access control system.

Do not rely on hiding buttons or navigation items.

Authorization must be enforced on the server for every protected operation.

## 6.1 Platform roles

Support the existing platform hierarchy:

1. Super Admin.
2. Organization Admin.
3. Tenant Admin.
4. Team Manager.
5. Yoga Instructor.
6. Dietitian/Nutritionist.
7. Member.

Adapt role names to the existing schema where necessary.

Do not introduce duplicate or conflicting role definitions.

## 6.2 Permission model

Create granular permissions.

Examples:

**Tenant management**
- tenant.view
- tenant.update
- tenant.manage_settings

**Website**
- website.view
- website.edit
- website.publish
- website.manage_templates
- website.manage_branding

**Members**
- members.view
- members.create
- members.update
- members.delete
- members.assign

**Yoga**
- yoga.view
- yoga.create
- yoga.update
- yoga.delete
- yoga.assign
- yoga.manage_sessions

**Diet**
- diet.view
- diet.create
- diet.update
- diet.assign

**Team**
- team.view
- team.invite
- team.update
- team.remove
- team.assign_roles

**Reports**
- reports.view
- reports.export

**Settings**
- settings.view
- settings.update

## 6.3 Suggested role permissions

| Role | Access |
|---|---|
| Super Admin | Platform-wide administration |
| Organization Admin | Authorized organization and tenant management |
| Tenant Admin | Full administration within assigned tenant |
| Team Manager | Team and assigned operational management |
| Yoga Instructor | Assigned yoga members, sessions and practice |
| Dietitian | Assigned diet members and plans |
| Member | Own permitted wellness information |

The final permissions must respect the existing business rules.

## 6.4 RBAC enforcement

Implement:

- Central permission definitions.
- Server-side permission checks.
- Route protection.
- API authorization.
- Server action authorization.
- UI permission-aware rendering.
- Role assignment validation.
- Audit logging for sensitive operations.

Prevent privilege escalation.

A user must not be able to change their own role by modifying a request.

Prevent users from assigning permissions above their authority.

## 6.5 Member data isolation

This is mandatory.

An instructor can only access member practice data when assigned and authorized.

A dietitian can only access permitted diet-related member data.

A tenant admin must not access another tenant's members.

A member must only access their own permitted records.

Do not assume that access to a member profile means permission to access all health or wellness records.

---

# PHASE 7 — EXPAND YOGA MANAGEMENT

Make the Yoga module a complete wellness management experience.

Add or improve:

### Yoga library
- Asana library.
- Pose categories.
- Difficulty levels.
- Sanskrit names.
- Instructions.
- Benefits.
- Contraindications where appropriate.
- Duration.
- Images or licensed illustrations.

### Yoga programmes
- Programme creation.
- Programme duration.
- Daily schedules.
- Pose sequences.
- Rest days.
- Instructor assignment.

### Yoga sessions
- Session scheduling.
- Instructor assignment.
- Participant assignment.
- Attendance.
- Session status.
- Session notes.

### Member yoga journey
- Assigned programmes.
- Completed sessions.
- Practice history.
- Progress tracking.
- Check-ins.

### Instructor tools
- Assigned members.
- Today's sessions.
- Attendance.
- Session completion.
- Practice notes.

### Yoga analytics
- Completed sessions.
- Member participation.
- Programme completion.
- Attendance.
- Engagement trends.

Respect member privacy and role permissions.

Do not fabricate health recommendations or claim clinical benefits.

---

# PHASE 8 — EXPAND TEAM MANAGEMENT

Create a more complete team-management experience.

### Team directory

Show:

- Name.
- Profile image.
- Role.
- Specialization.
- Contact information.
- Status.
- Assigned members.
- Assigned programmes.

### Team actions

Authorized administrators should be able to:

- Invite team members.
- Edit team profiles.
- Assign roles.
- Assign permissions.
- Assign members.
- Assign programmes.
- Activate/deactivate accounts.
- Review team activity.

### Team workload

Show useful metrics:

- Assigned members.
- Active programmes.
- Sessions scheduled.
- Sessions completed.
- Pending tasks.

### Team access control

- Do not allow unauthorized role changes.
- Do not allow cross-tenant team access.
- Record sensitive permission changes.
- Preserve existing invitation and authentication flows.

---

# PHASE 9 — SIDEBAR AND SIDE-PANEL REPAIR

Audit every existing side panel.

Fix:

- Overflow.
- Incorrect width.
- Overlapping content.
- Misalignment.
- Broken collapse behavior.
- Nested scrollbars.
- Off-screen content.
- Dialog overlap.
- Mobile drawer issues.

## Desktop sidebar

Provide a functional collapse button.

Expanded:
- Icon and label.
- Full navigation.
- Brand identity.

Collapsed:
- Icon-only navigation.
- Tooltips.
- Accessible labels.
- Clear active indicator.

The collapse state must persist across navigation and refreshes where appropriate.

The sidebar must not cover main content.

The main content must automatically adjust when the sidebar expands or collapses.

Use a consistent transition without layout jumps.

## Mobile sidebar

On mobile, use an overlay drawer.

It must:

- Open from the menu control.
- Close using the close button.
- Close after selecting a route.
- Support keyboard interaction.
- Prevent background interaction while open.
- Respect safe areas.
- Never cover the fixed bottom navigation incorrectly.

Do not introduce nested scrolling containers unnecessarily.

---

# PHASE 10 — CONSISTENT PAGE SPACING AND PADDING

Every page must follow one shared spacing system.

Create reusable layout rules.

### Suggested desktop values

- Main content horizontal padding: 24–32px.
- Main content vertical padding: 24–32px.
- Page header bottom spacing: 24px.
- Section spacing: 24–32px.
- Grid gaps: 16–24px.

### Tablet

- Horizontal padding: 20–24px.
- Consistent section spacing.

### Mobile

- Horizontal padding: 16px.
- Vertical padding: 16–24px.
- Section gaps: 16–20px.

Use responsive tokens instead of arbitrary values scattered across pages.

All pages should have consistent:

- Heading alignment.
- Page width.
- Section spacing.
- Table spacing.
- Button height.
- Card padding.
- Dialog padding.
- Form spacing.

Avoid unnecessary empty space and content collisions.

---

# PHASE 11 — PALETTE-STYLE MOBILE BOTTOM NAVIGATION

Introduce a fixed mobile bottom navigation inspired by the Palette design.

This is for the main user actions and primary navigation.

### Mobile navigation

Use a maximum of five primary destinations.

Suggested member navigation:

1. Home.
2. Yoga.
3. Diet.
4. Progress.
5. Profile.

For tenant admin users, show the five most relevant destinations based on permissions.

The navigation must be role-aware.

### Design

- Fixed to bottom.
- Colorful icons.
- Active indicator.
- Compact labels.
- Rounded/glass surface.
- Soft shadow.
- Safe-area support.
- Smooth transitions.

### Behavior

- Always visible on supported mobile routes.
- Never disappear during navigation.
- Never cover forms, buttons or content.
- Main page content must include appropriate bottom padding.
- Hide or adapt it on pages where it would obstruct a critical full-screen task.

Do not show unauthorized destinations.

Do not show the same navigation items to every role if their permissions differ.

### Desktop

Use the desktop navigation architecture and collapsible sidebar where appropriate.

Do not force the mobile bottom bar onto desktop.

---

# PHASE 12 — RESPONSIVE DESIGN

Test the complete platform at:

- 360px
- 375px
- 390px
- 430px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

Every page must adapt naturally.

Check:

- Header.
- Sidebar.
- Tables.
- Metric cards.
- Forms.
- Dialogs.
- Website editor.
- Template gallery.
- Website preview.
- Yoga library.
- Team directory.
- Bottom navigation.

No horizontal overflow.

No clipped text.

No overlapping buttons.

No off-screen dialogs.

No broken side panels.

The website editor must remain usable on mobile. Provide an appropriate simplified editing experience rather than squeezing the full desktop editor into a phone screen.

---

# PHASE 13 — TENANT WEBSITE PREVIEW AND PUBLISHING SAFETY

Before publishing a tenant website:

Validate:

- Required business name.
- Required branding.
- Required public content.
- Valid contact information.
- Valid template.
- Valid tenant ownership.
- Public visibility settings.

Publishing must be an explicit action.

Provide clear states:

- Draft.
- Published.
- Unpublished.
- Changes pending.

If possible, preserve previous published content so a failed edit does not take down the live website.

A tenant must never publish another tenant's website.

---

# PHASE 14 — SECURITY AND AUDIT LOGGING

Audit all sensitive actions:

- Role changes.
- Permission changes.
- Team invitations.
- Member assignments.
- Website publishing.
- Website template changes.
- Tenant settings changes.

Record:

- Actor.
- Tenant.
- Action.
- Target resource.
- Timestamp.
- Relevant before/after metadata, excluding secrets.

Do not log passwords, tokens, session cookies or sensitive authentication secrets.

Add tests for cross-tenant access and privilege escalation.

---

# PHASE 15 — DATABASE AND BACKEND SAFETY

Preserve the existing production architecture.

Before changing the database:

1. Inspect the current schema.
2. Identify the exact missing entities or fields.
3. Prefer extending existing tables.
4. Avoid duplicate models.
5. Create safe, reversible migrations.
6. Preserve existing tenant records.
7. Preserve existing user accounts.
8. Preserve current authentication.

Never run destructive migrations against production as part of development testing.

Do not reset or truncate production tables.

Do not create a second source of truth for permissions or website settings.

---

# PHASE 16 — IMPLEMENTATION ORDER

Implement in controlled stages.

**Stage 1**
- Architecture audit.
- Design tokens.
- Shared layout.
- Consistent spacing.
- Metric alignment.

**Stage 2**
- Sidebar fixes.
- Collapse button.
- Mobile drawer.
- Palette-inspired bottom navigation.

**Stage 3**
- Tenant website template gallery.
- Template selection.
- Website editor.
- Live preview.
- Save draft and publish.

**Stage 4**
- Tenant public website Sign In.
- Tenant-aware authentication.
- Public/private route separation.

**Stage 5**
- Central RBAC.
- Role-permission matrix.
- Server-side enforcement.
- Tenant isolation tests.

**Stage 6**
- Yoga management improvements.
- Team management improvements.
- Workload and analytics.

**Stage 7**
- Responsive QA.
- Security tests.
- Regression tests.
- Production build.

Do not leave major features as empty placeholder pages.

---

# PHASE 17 — ACCEPTANCE TESTS

## Dashboard

- Metrics are aligned.
- Metric values come from real data.
- Responsive grid works.
- No text clipping.

## Website builder

- Tenant can browse templates.
- Tenant can preview templates.
- Tenant can select a template.
- Tenant can edit branding and content.
- Tenant can save drafts.
- Tenant can preview mobile and desktop.
- Tenant can publish.
- Tenant can change templates without losing content.
- Tenant A cannot edit Tenant B's website.

## Public website

- Correct tenant website loads.
- Sign In is visible.
- Sign In works.
- Authentication is tenant-aware.
- Unauthorized visitors cannot access admin pages.
- Mobile navigation works.

## RBAC

- Roles have correct permissions.
- API checks permissions.
- Server actions check permissions.
- Unauthorized actions are rejected.
- Cross-tenant access is denied.
- Users cannot escalate their own privileges.
- Member data remains isolated.

## Yoga

- Yoga library works.
- Programmes work.
- Sessions work.
- Instructor assignments work.
- Attendance works.
- Member progress works.
- Permissions are enforced.

## Team

- Team directory works.
- Invitations work.
- Role assignments work.
- Member assignments work.
- Team workload displays correct data.
- Unauthorized actions are blocked.

## Navigation

- Sidebar expands.
- Sidebar collapses.
- Collapse state persists.
- Main content adjusts correctly.
- Mobile drawer works.
- Bottom navigation remains visible.
- No overlapping navigation.

## Responsive

Test all required viewport widths.

---

# PHASE 18 — TESTING AND VERIFICATION

Run:

- TypeScript typecheck.
- Lint.
- Unit tests.
- Component tests.
- RBAC tests.
- Tenant isolation tests.
- Website builder tests.
- Mobile navigation tests.
- Relevant integration tests.
- Production build.

Do not run destructive database tests against production.

Use the existing project's documented isolated test database setup.

Perform actual browser verification, not just compilation.

---

# FINAL REPORT

Provide a report with:

## 1. Architecture Audit
What existed and what needed improvement.

## 2. Metric Alignment
Pages updated and responsive behavior.

## 3. Website Builder
Number of templates, editor features, preview and publishing behavior.

## 4. Tenant Sign In
Authentication flow and tenant isolation.

## 5. RBAC
Roles, permissions and server-side enforcement.

## 6. Yoga
Features implemented.

## 7. Team
Features implemented.

## 8. Navigation
Sidebar collapse, mobile drawer and bottom navigation.

## 9. Responsive QA
Results for all required screen sizes.

## 10. Database
Exact schema and migration changes, if any.

## 11. Security
Tenant isolation, privilege escalation and permission test results.

## 12. Testing
Typecheck, lint, tests and production build.

## 13. Remaining Work
List anything not completed honestly.

---

# NON-NEGOTIABLE RULES

1. Existing Adira architecture is the source of truth.
2. Strict tenant data isolation must be preserved.
3. RBAC must be enforced server-side, not just through the UI.
4. Website templates must be independently editable by each tenant.
5. Changing templates must not erase tenant content.
6. Public website Sign In must use the existing authentication architecture.
7. Metric alignment must be consistent across all dashboards.
8. Every page must follow the same spacing system.
9. All side-panel errors must be fixed.
10. Sidebar must have a working collapse control.
11. Mobile navigation must follow the Palette design direction.
12. Every feature must be functional, not a visual placeholder.
13. Do not fabricate data or metric values.
14. Do not introduce duplicate backend systems.
15. Do not break existing routes, sessions or integrations.
16. Do not commit or deploy until the changes have been reviewed and approved.

**FINAL PRODUCT VISION**

Adira should feel like a complete, professional multi-tenant wellness platform where every tenant can own and customize a beautiful public website, manage its members and team, deliver yoga and nutrition programmes, and securely control access through granular RBAC.

The experience must be visually consistent, responsive, intuitive and production-ready.

### My recommendation before implementation

Pay particular attention to **three things**:

1. **Website templates:** Build a reusable content model so changing templates changes presentation, not the tenant's saved content.
2. **RBAC:** Enforce permissions in APIs and server actions. Hiding a button is not security.
3. **Mobile navigation:** Make the five bottom actions change according to the logged-in role, so members, instructors and tenant administrators see the correct actions.

This should be implemented in stages, with tenant isolation and authorization tests before deploying to Railway.

# PRD — Tenant website builder (Stage 3)

**Status:** APPROVED by the user, 2026-11-10, as written. Decision recorded with it:
public offerings are **typed in the editor**, never pulled from internal programmes (which
can carry clinical detail).
**Source:** `docs/PLATFORM-UPGRADE-BRIEF.md` Phases 4, 5, 13 (supplied 2026-11-10).
**Plan:** `docs/PLATFORM-UPGRADE-RECONCILIATION.md`.

BMAD's Product phase asks for PRD, REQUIREMENTS, USER-STORIES and ACCEPTANCE-CRITERIA as
four files. For one feature they are kept in this one document so they cannot drift.

---

## 1. Problem and outcome

Every organisation on Adira needs a public web presence that it controls, without a
developer and without affecting any other organisation. Today there is none: no tables,
no public tenant pages, no templates [fact, audit 2026-11-10].

**Outcome:** an Admin picks one of eight templates, fills in their content once, previews
it on phone, tablet and desktop, and publishes it at `/s/<their-slug>`. Visitors see a
Sign In button that leads into Adira's existing sign-in, aware of which organisation they
came from. Switching templates later changes the look, never the content.

## 2. Users

| Who | Wants |
|---|---|
| Organisation Admin | Launch and maintain the studio's site quickly; never break the live site while editing |
| Visitor / prospective member | Understand the studio, contact it, request access |
| Existing member | Get from the studio's site into their account in one tap |

## 3. How it works (the content model is the core)

```
            ┌──────────── one content document per organisation ────────────┐
 Editor ──► │ branding · hero · about · services · team · offerings ·       │
            │ contact · social · footer · section order + visibility · SEO  │
            └──────────────┬───────────────────────────────┬────────────────┘
                     draft │                          publish (copy)
                           ▼                               ▼
              Template N renders draft            published snapshot  ──► /s/<slug>
              (admin preview only)                + version history (restore)
```

- **One normalized content document** (JSON, schema-versioned, validated with zod on every
  write). Templates are code; they only *read* this document. Changing template rewrites
  one field and nothing else — FR-WEB-008.
- **Draft and published are separate copies.** Editing only ever touches the draft. The
  live site changes only on an explicit Publish, which copies draft → published and
  appends a version. A bad edit can never take the live site down — FR-WEB-014.

### Data (migration `013`, additive)

| Table | Purpose | Key columns |
|---|---|---|
| `organization_websites` | one row per organisation | `organization_id` (PK, FK), `template_key`, `draft_content jsonb`, `draft_updated_at/by`, `published_content jsonb NULL`, `published_template_key`, `published_at/by`, `is_live boolean` |
| `organization_website_versions` | publish history for restore | `id`, `organization_id`, `template_key`, `content jsonb`, `published_at`, `published_by` — last 20 kept |

Images use the existing `media_assets` table and ImageKit, with `purpose = 'website'` and
`requires_signed_url = false` (public by design — everything else stays private).
**Needs ImageKit keys in production** [fact: not set today].

## 4. Templates

Eight templates, each a distinct **layout**, not a recolour. All render the same content
and are responsive from 360px to 1920px.

| Key | Name | What makes it structurally different |
|---|---|---|
| `minimal` | Wellness Minimal | Single column, large type, hairline dividers, text-led hero |
| `retreat` | Yoga Retreat | Full-bleed image hero, class-schedule style offerings grid, instructor cards |
| `fitness` | Modern Fitness | Split hero with bold stats strip, alternating feature rows, strong CTA bands |
| `holistic` | Holistic Wellness | Organic blob shapes, centred narrative sections, soft cards |
| `nutrition` | Nutrition Studio | Offerings as menu-style list with categories, warm accent bands |
| `premium` | Premium Wellness | Dark surface, serif display type, editorial two-column about |
| `community` | Community Wellness | Team-first layout, photo mosaic, events/occasions strip |
| `corporate` | Corporate Wellness | Header with nav, programme table, logos/credentials row, formal footer |

Each template ships with a default colour preset and font pairing; the Admin can override
both (FR-WEB-005).

## 5. Requirements

### Functional

| ID | Requirement |
|---|---|
| FR-WEB-001 | An Admin can open **Website** in the admin console (`/admin/website`). |
| FR-WEB-002 | Template gallery shows all eight with a thumbnail, description and desktop/mobile preview. |
| FR-WEB-003 | Applying a different template asks for confirmation and keeps all content. |
| FR-WEB-004 | Editor covers: business name, tagline, logo, favicon, cover image; hero (heading, text, image, primary and secondary call to action); about (introduction, mission, philosophy); services (yoga, meditation, pranayama, diet consultation, personal training, programmes — each toggleable with a description); team (name, role, photo, qualifications, specialisations); offerings (name, description, duration, optional price when pricing is enabled); contact (phone, email, address, maps link); social links; footer text; SEO title and description. |
| FR-WEB-005 | Colours: choose a palette preset or a custom brand colour. A custom colour is **rejected if text on it would fail WCAG AA**, with the reason shown. Fonts: one of four curated pairings. |
| FR-WEB-006 | Every optional section can be shown/hidden and reordered. |
| FR-WEB-007 | Edits autosave to the **draft** only (debounced, with a "Saved" indicator). Nothing autosaves to the live site. |
| FR-WEB-008 | Preview renders the draft in phone (390px), tablet (768px) and desktop (1280px) frames using real viewport widths (iframes), so templates' responsive rules are what is shown. |
| FR-WEB-009 | Status is always visible: **Draft (never published)**, **Published**, **Published — changes pending**, **Unpublished**. |
| FR-WEB-010 | **Publish** validates (§7), then copies draft → live and records a version. |
| FR-WEB-011 | **Unpublish** takes the site offline (visitors get 404); content is kept. |
| FR-WEB-012 | **Restore** loads any of the last 20 published versions into the draft (not straight to live). |
| FR-WEB-013 | Public site at `/s/<slug>` renders only the **published** snapshot; never the draft. 404 if not live or the organisation is not ACTIVE. |
| FR-WEB-014 | Public header (desktop and mobile menu) has **Sign In** → `/sign-in?org=<slug>`; and **Request access** where the organisation accepts requests. |
| FR-WEB-015 | `/sign-in?org=<slug>` shows that organisation's name and logo. After Clerk verifies identity, if the person belongs to several organisations and one matches the hint, it is pre-selected — **still validated server-side** by `completeSignIn` (ADR-012). A non-member lands on No access with a link to request access to *that* organisation. |
| FR-WEB-016 | On a phone, the editor is a section-by-section accordion with a single "Preview" toggle, not the desktop three-pane layout. |

### Non-functional

| ID | Requirement |
|---|---|
| NFR-SEC-WEB-001 | Every website repository function takes `organizationId` from the session (invariant 1, ADR-004). No endpoint accepts an organisation or website id. |
| NFR-SEC-WEB-002 | The public route reads published content by slug only; it can never reach a draft, another table, or any member data. |
| NFR-SEC-WEB-003 | All content is rendered as text — no HTML from tenants, no script, no embeds. Links are restricted to `https:`, `mailto:`, `tel:`. Prevents a tenant attacking visitors. |
| NFR-SEC-WEB-004 | Website permissions: `website.view/edit/publish/manage_templates` for ADMIN only until Stage 4's matrix decides TEAM_MANAGER. Enforced in every action, not by hiding buttons. |
| NFR-SEC-WEB-005 | Audit: template change, publish, unpublish, restore — actor, organisation, before/after template and version id. Draft autosaves are not audited (volume). |
| NFR-PERF-WEB-001 | Public pages server-rendered and cached; publish revalidates the path. |
| NFR-A11Y-WEB-001 | Every template passes AA contrast with its presets, has landmarks, alt text fields for every image, and works by keyboard. |

## 6. User stories and acceptance criteria

| Story | Acceptance criteria |
|---|---|
| US-WEB-1 As an Admin I choose a template | Gallery shows 8; picking one with existing content shows a confirmation; after applying, every field I entered is still there. |
| US-WEB-2 As an Admin I edit and preview safely | Editing shows "Saved" within 2s; the live site is unchanged until I publish; preview shows phone, tablet and desktop. |
| US-WEB-3 As an Admin I publish | Publish with a missing business name or invalid email is refused with the field named; a valid publish makes `/s/<slug>` show my content and status "Published". |
| US-WEB-4 As an Admin I recover | I can unpublish (site 404s) and republish; I can restore an earlier version into the draft. |
| US-WEB-5 As a visitor I sign in from the studio site | Sign In is visible on desktop and in the mobile menu; it shows the studio's branding; a member of that studio reaches their own home; a non-member reaches No access with a request-access link. |
| US-WEB-6 Isolation | An Admin of Org A cannot read or change Org B's draft, publish state or versions by any request (tested). An unpublished site is 404 to everyone. |

## 7. Publish validation

Business name present · at least the hero heading present · contact email valid if given,
phone valid if given, at least one contact method · every image has alt text · all links
`https:`/`mailto:`/`tel:` · template key known · custom colour passes AA · organisation ACTIVE.

## 8. Out of scope (for this stage)

Custom domains and subdomains (data model leaves room) · online payments and checkout ·
blog/news · contact forms (no outbound email path beyond Clerk) · embedded Google Maps
(a maps **link** is supported; an embed would loosen the CSP) · visitor analytics ·
multi-language site content.

## 9. Delivery

| Slice | Contents |
|---|---|
| 3a | Migration `013`, content schema + validation, repository, permissions, audit, tests incl. cross-tenant isolation |
| 3b | Public `/s/<slug>` with the 8 templates; Sign In / tenant-aware sign-in (FR-WEB-014/015) |
| 3c | Admin gallery, editor (desktop + mobile), autosave, preview frames, publish/unpublish/restore |
| 3d | Image uploads (needs ImageKit keys), browser QA at all nine widths |

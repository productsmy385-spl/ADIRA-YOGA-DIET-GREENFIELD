# ADR-010 — The locale lives in a cookie, not in the URL

**Decision:** Adira does not put a locale segment in its paths. There is no `/en/...` or
`/te/...`. The locale is negotiated per request from a cookie, falling back to
`Accept-Language`, then the organisation's default, then English.

**Status:** Accepted

**Date:** 2026-08-22

---

## Why

The usual reason to prefix URLs with a locale is search indexing: `/te/yoga` and
`/en/yoga` are distinct documents a crawler can find, and `hreflang` needs distinct URLs
to point at.

**None of that applies here.** Adira is private, authenticated software. Its root layout
sets `robots: { index: false, follow: false }`. There is no crawler to serve, no
`hreflang` to publish, and no organic search traffic to win. The one benefit of URL
prefixes is worth nothing to this product.

The costs are real and recurring:

- **Every internal link becomes locale-aware.** Every `href` must be constructed through
  a locale-aware helper, and every one that is not is a bug that silently drops the
  reader back to the default language.
- **Every route file moves under `[locale]/`.** Route groups, layouts, and the API
  boundary all gain a segment that carries no meaning for a signed-in user whose
  preference is already known.
- **A shared link changes the recipient's language.** A consultant sending a customer a
  link to their report would impose the consultant's locale on it — which is exactly
  backwards for the person receiving therapy.

That last one decided it. In a product where a consultant routinely sends links to
customers, the URL carrying the *sender's* language is an active harm.

## Alternatives considered

**Locale prefix in the path (`next-intl` routing).** The default for `next-intl` and the
right answer for public marketing sites. Rejected for the reasons above.

**Domain per locale.** Appropriate at a scale Adira is nowhere near, and it multiplies
the Railway and DNS work per language.

**Accept-Language only, no persistence.** Simplest, and wrong: a customer whose device is
set to English but who wants Telugu has no way to say so, and the product supports five
Indian languages precisely because device language is a poor proxy for reading preference.

## Chosen approach

`src/i18n/locales.ts` holds the negotiation as pure functions —
`parseAcceptLanguage` and `resolveLocale` — with 34 tests, because locale selection is
the kind of logic that looks obviously correct and then serves Hindi to someone who asked
for Kannada. Regional subtags collapse (`te-IN` → `te`), q-values are honoured including
out-of-order ones, `*` is ignored, and unknown values fall through at every level rather
than throwing, so a stale cookie cannot break the page.

`src/i18n/request.ts` wires it into `next-intl`. The root layout sets `lang` and `dir`
from the resolved locale — a screen reader takes its pronunciation from `lang`, so a page
of Telugu marked `lang="en"` is read aloud as mangled English.

Priority order is: user's saved preference → cookie → `Accept-Language` → organisation
default → English. The saved preference outranks the cookie because an explicit choice
should follow a person across devices.

## Impact

- **Pages that resolve a locale become dynamic.** `/` moved from static to server-rendered
  when this landed, because reading a cookie forces it. That is the price of this
  decision and it is worth paying here — there is no public page whose static
  prerendering matters, since nothing is indexed. If a genuinely public marketing page is
  ever added, it should opt out of translation rather than reintroduce URL prefixes.
- **The user's saved preference is not read during request config.** That would put a
  database query on the render path of every page, including signed-out ones. Phase 2
  writes the preference into the cookie at sign-in instead, keeping resolution
  synchronous and cheap.
- **Reversing this is expensive** — it means moving every route under `[locale]/` and
  auditing every link. Which is the argument for having decided it now, with one page
  built, rather than after Phase 5.

## What this does not decide

- Whether clinical content — yoga and diet instructions — is translated at all. v2.0 §26
  requires human review of those, which is a workflow question, not a plumbing one.
  Machine translation must not reach an instruction someone will follow with their body.
- The language picker's placement. Phase 5 UX.

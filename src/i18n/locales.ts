/**
 * Supported locales, and how one is chosen.
 *
 * Everything here is pure so the negotiation rules can be tested exhaustively — locale
 * selection is exactly the kind of logic that looks obviously correct and then quietly
 * serves Hindi to someone who asked for Kannada.
 *
 * See decisions/ADR-010 for why the locale lives in a cookie rather than a URL prefix.
 */

/**
 * Every locale the product intends to support. The architecture is built for all of
 * them — this is the list §26 asks for.
 */
export const LOCALES = ["en", "te", "hi", "kn", "ta", "ml"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Locales that actually have a message catalogue in `messages/`.
 *
 * This exists because the two lists are not the same, and conflating them is a 500.
 * Resolution used to return any locale in `LOCALES`, after which `request.ts` imported
 * `messages/${locale}.json` — so a browser sending `Accept-Language: te-IN` resolved to
 * Telugu, the import failed, and the page returned HTTP 500. Every unit test passed,
 * because the resolver was doing exactly what it was asked to do.
 *
 * Advertising a language we cannot render is worse than not offering it: the reader
 * either gets an error page, or gets English sitting under a Telugu label, which is a
 * more confusing failure than an honest absence.
 *
 * **Add a locale here only when `messages/<locale>.json` exists.** `messages.test.ts`
 * enforces that.
 */
export const AVAILABLE_LOCALES = ["en"] as const satisfies readonly Locale[];
export type AvailableLocale = (typeof AVAILABLE_LOCALES)[number];

export function isAvailableLocale(value: unknown): value is AvailableLocale {
  return (
    typeof value === "string" && (AVAILABLE_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * The fallback every resolution path ends at.
 *
 * Typed `AvailableLocale`, not `Locale`, and declared after that type deliberately. The
 * default is the one locale that must always render — typing it as the wider `Locale`
 * would let a future edit point the fallback at a language with no catalogue, which is
 * the exact 500 that `AVAILABLE_LOCALES` exists to prevent, reintroduced at the one
 * place nothing else can catch it.
 */
export const DEFAULT_LOCALE: AvailableLocale = "en";

/** Cookie name. Read on the server, written on the client when a user chooses. */
export const LOCALE_COOKIE = "adira-locale";

/**
 * Endonyms — each language's name in itself.
 *
 * A language picker that lists "Telugu" in English is useless to the person who needs
 * it most: someone who cannot read the current interface language. "తెలుగు" is legible to
 * exactly the reader who should be selecting it.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  ta: "தமிழ்",
  ml: "മലയാളം",
};

/**
 * All six are left-to-right, but the field is declared now so that adding Urdu or Arabic
 * later is a data change rather than an audit of every layout.
 */
export const LOCALE_DIRECTION: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  te: "ltr",
  hi: "ltr",
  kn: "ltr",
  ta: "ltr",
  ml: "ltr",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse an Accept-Language header into locales, most-preferred first.
 *
 * Handles the parts that a naive `split(",")` gets wrong:
 *  - q-values, which are not necessarily in descending order in the header
 *  - regional subtags — `te-IN` must match `te`
 *  - `*`, the wildcard, which means "anything" and must not be treated as a language
 *  - whitespace, casing, and malformed q-values
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return [];

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const parsed = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      // A malformed q is treated as 0 rather than 1: the client said something we could
      // not read, and guessing "highest priority" is the wrong way to be wrong.
      const q = Number.isFinite(parsed) ? parsed : 0;
      return { tag: tag.trim().toLowerCase(), q };
    })
    .filter((c) => c.tag.length > 0 && c.q > 0)
    // Stable sort by descending q. Order within equal q is the header's own order,
    // which is what the specification intends.
    .sort((a, b) => b.q - a.q);

  const result: Locale[] = [];

  for (const { tag } of candidates) {
    if (tag === "*") continue;
    // `te-IN` → `te`. Region and script subtags carry no meaning for us today.
    const base = tag.split("-")[0];
    if (isLocale(base) && !result.includes(base)) {
      result.push(base);
    }
  }

  return result;
}

export interface LocaleSources {
  /** The user's saved preference. Highest priority — they chose it explicitly. */
  readonly userPreference?: string | null;
  /** The locale cookie, for a visitor who chose before signing in. */
  readonly cookie?: string | null;
  /** The browser's Accept-Language header. */
  readonly acceptLanguage?: string | null;
  /** The organisation's default, for a member who has expressed no preference. */
  readonly organizationLocale?: string | null;
}

/**
 * Resolve the locale to render in.
 *
 * Priority, most to least specific:
 *
 *   1. the signed-in user's saved preference — an explicit choice, and it must follow
 *      them across devices, which is why it outranks the cookie
 *   2. the cookie — an explicit choice made before signing in
 *   3. Accept-Language — an inference from the browser, not a choice
 *   4. the organisation's default — a sensible guess for a member of a Telugu-speaking
 *      studio whose browser is set to English
 *   5. English
 *
 * Unknown values at any level fall through rather than throwing. A stale cookie naming a
 * locale that has since been removed must not break the page.
 */
export function resolveLocale(
  sources: LocaleSources,
  /**
   * Which locales can actually be rendered. Injected so the priority rules can be tested
   * against a multi-locale set — with only English shipped, every ordering assertion
   * would otherwise collapse to "en" and prove nothing. This is also the code path that
   * begins to matter the day a second catalogue lands.
   */
  available: readonly Locale[] = AVAILABLE_LOCALES,
): Locale {
  const isAvailable = (value: unknown): value is Locale =>
    typeof value === "string" && (available as readonly string[]).includes(value);

  // Availability is checked HERE, at resolution, rather than inside parseAcceptLanguage.
  //
  // Parsing a header and deciding what we can render are separate questions, and pushing
  // availability down into the parser would mean its tests could only ever exercise
  // English — losing coverage of subtag collapsing and q-ordering, which is the part
  // most likely to be wrong.
  //
  // Every check is against AVAILABLE_LOCALES, not LOCALES. A preference for a language
  // we intend to support but have not yet translated falls through to the next source,
  // and ultimately to English — which is what the reader would have got anyway, minus
  // the error page.
  if (isAvailable(sources.userPreference)) return sources.userPreference;
  if (isAvailable(sources.cookie)) return sources.cookie;

  const fromHeader = parseAcceptLanguage(sources.acceptLanguage).find(isAvailable);
  if (fromHeader) return fromHeader;

  if (isAvailable(sources.organizationLocale)) return sources.organizationLocale;

  return DEFAULT_LOCALE;
}

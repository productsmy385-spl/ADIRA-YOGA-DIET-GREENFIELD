/**
 * Supported locales, and how one is chosen.
 *
 * Everything here is pure so the negotiation rules can be tested exhaustively — locale
 * selection is exactly the kind of logic that looks obviously correct and then quietly
 * serves Hindi to someone who asked for Kannada.
 *
 * See decisions/ADR-010 for why the locale lives in a cookie rather than a URL prefix.
 */

export const LOCALES = ["en", "te", "hi", "kn", "ta", "ml"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

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
export function resolveLocale(sources: LocaleSources): Locale {
  if (isLocale(sources.userPreference)) return sources.userPreference;
  if (isLocale(sources.cookie)) return sources.cookie;

  const fromHeader = parseAcceptLanguage(sources.acceptLanguage);
  if (fromHeader.length > 0) return fromHeader[0];

  if (isLocale(sources.organizationLocale)) return sources.organizationLocale;

  return DEFAULT_LOCALE;
}

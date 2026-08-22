import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_DIRECTION,
  LOCALE_LABELS,
  LOCALES,
  parseAcceptLanguage,
  resolveLocale,
} from "./locales";

describe("isLocale", () => {
  it.each(LOCALES)("accepts %s", (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it("rejects anything else, including near-misses and non-strings", () => {
    for (const value of ["EN", "en-GB", "fr", "", null, undefined, 42, {}]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe("parseAcceptLanguage", () => {
  it("returns nothing for a missing or empty header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("reads a single language", () => {
    expect(parseAcceptLanguage("hi")).toEqual(["hi"]);
  });

  // The header's order is not authoritative — q-values are. A client may legitimately
  // send its preferred language last.
  it("orders by q-value, not by position in the header", () => {
    expect(parseAcceptLanguage("en;q=0.3,ta;q=0.9,hi;q=0.5")).toEqual(["ta", "hi", "en"]);
  });

  it("treats an absent q-value as 1", () => {
    expect(parseAcceptLanguage("kn,en;q=0.8")).toEqual(["kn", "en"]);
  });

  // te-IN must match te. Without this, an Indian browser asking for Telugu gets English.
  it("matches a regional subtag to its base language", () => {
    expect(parseAcceptLanguage("te-IN")).toEqual(["te"]);
    expect(parseAcceptLanguage("ta-LK,ml-IN;q=0.8")).toEqual(["ta", "ml"]);
  });

  it("ignores the wildcard rather than treating it as a language", () => {
    expect(parseAcceptLanguage("*")).toEqual([]);
    expect(parseAcceptLanguage("ml,*;q=0.1")).toEqual(["ml"]);
  });

  it("drops unsupported languages", () => {
    expect(parseAcceptLanguage("fr,de;q=0.9,ta;q=0.1")).toEqual(["ta"]);
    expect(parseAcceptLanguage("fr,de")).toEqual([]);
  });

  it("deduplicates when several regional variants map to one language", () => {
    expect(parseAcceptLanguage("hi-IN,hi-Latn;q=0.9,hi;q=0.8")).toEqual(["hi"]);
  });

  it("tolerates whitespace and mixed casing", () => {
    expect(parseAcceptLanguage("  TE-in ; q=0.9 ,  EN ; q=0.4 ")).toEqual(["te", "en"]);
  });

  it("drops entries with q=0, which explicitly mean 'not acceptable'", () => {
    expect(parseAcceptLanguage("en;q=0,ta;q=0.5")).toEqual(["ta"]);
  });

  // Guessing "highest priority" for something we could not parse is the wrong way to be
  // wrong — it would let a malformed header outrank a well-formed preference.
  it("treats a malformed q-value as lowest priority rather than highest", () => {
    expect(parseAcceptLanguage("en;q=abc,ta;q=0.2")).toEqual(["ta"]);
  });

  it("does not throw on junk", () => {
    expect(() => parseAcceptLanguage(";;;,,,q=")).not.toThrow();
    expect(parseAcceptLanguage(";;;,,,q=")).toEqual([]);
  });
});

describe("resolveLocale", () => {
  it("falls back to English when nothing is known", () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
  });

  // An explicit choice must follow the person across devices, which is why the saved
  // preference outranks the cookie on the device they happen to be using.
  it("prefers the user's saved preference above everything", () => {
    expect(
      resolveLocale({
        userPreference: "ta",
        cookie: "hi",
        acceptLanguage: "kn",
        organizationLocale: "ml",
      }),
    ).toBe("ta");
  });

  it("uses the cookie when there is no saved preference", () => {
    expect(resolveLocale({ cookie: "kn", acceptLanguage: "hi" })).toBe("kn");
  });

  it("uses Accept-Language when there is no explicit choice", () => {
    expect(resolveLocale({ acceptLanguage: "ml-IN,en;q=0.5" })).toBe("ml");
  });

  // A member of a Telugu-speaking studio whose browser is set to a language we do not
  // support should get Telugu, not English.
  it("falls back to the organisation's locale before English", () => {
    expect(resolveLocale({ acceptLanguage: "fr", organizationLocale: "te" })).toBe("te");
  });

  it("prefers Accept-Language over the organisation default", () => {
    expect(resolveLocale({ acceptLanguage: "hi", organizationLocale: "te" })).toBe("hi");
  });

  // A stale cookie naming a locale that has since been removed must not break the page.
  it("falls through unknown values at every level rather than throwing", () => {
    expect(
      resolveLocale({
        userPreference: "klingon",
        cookie: "fr",
        acceptLanguage: "de",
        organizationLocale: "es",
      }),
    ).toBe(DEFAULT_LOCALE);
  });

  it("ignores an empty-string preference", () => {
    expect(resolveLocale({ userPreference: "", cookie: "hi" })).toBe("hi");
  });
});

describe("locale metadata", () => {
  it.each(LOCALES)("gives %s a label and a direction", (locale) => {
    expect(LOCALE_LABELS[locale]).toBeTruthy();
    expect(["ltr", "rtl"]).toContain(LOCALE_DIRECTION[locale]);
  });

  // A picker listing "Telugu" in English is useless to the reader who needs it most:
  // someone who cannot read the current interface language.
  it("labels each non-English locale in its own script, not in English", () => {
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      expect(LOCALE_LABELS[locale]).not.toMatch(/^[\x20-\x7E]+$/);
    }
  });
});

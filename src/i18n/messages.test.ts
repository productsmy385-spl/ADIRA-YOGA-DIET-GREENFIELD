import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES } from "./locales";

/**
 * The guard for a bug that shipped and was only caught by running the app.
 *
 * `resolveLocale` used to return any locale in `LOCALES`, and `request.ts` then imported
 * `messages/${locale}.json`. A browser sending `Accept-Language: te-IN` resolved to
 * Telugu, the import failed, and the page returned **HTTP 500**.
 *
 * Every unit test passed throughout, because they tested the resolver in isolation and
 * the resolver was doing exactly what it had been asked to do. The defect lived in the
 * gap between "locale we intend to support" and "locale we can actually render", and
 * nothing compared those two lists. This file does.
 */

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "messages");

describe("message catalogues", () => {
  it.each(AVAILABLE_LOCALES)("has a catalogue file for advertised locale %s", (locale) => {
    expect(
      existsSync(join(MESSAGES_DIR, `${locale}.json`)),
      `AVAILABLE_LOCALES lists "${locale}" but messages/${locale}.json does not exist. ` +
        `Either add the catalogue or remove the locale — advertising a language that ` +
        `cannot be rendered returns HTTP 500 to anyone whose browser requests it.`,
    ).toBe(true);
  });

  it.each(AVAILABLE_LOCALES)("has a parseable, non-empty catalogue for %s", (locale) => {
    const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8");
    const parsed = JSON.parse(raw);

    expect(typeof parsed).toBe("object");
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it("always has a catalogue for the default locale", () => {
    // Everything falls back here. If this file is missing there is no recovery.
    expect(existsSync(join(MESSAGES_DIR, `${DEFAULT_LOCALE}.json`))).toBe(true);
  });

  it("advertises only locales the product intends to support", () => {
    for (const locale of AVAILABLE_LOCALES) {
      expect(LOCALES).toContain(locale);
    }
  });

  /**
   * Every catalogue must have exactly the same key structure as English. A missing key
   * renders a fallback, which is a silent English string in an otherwise translated
   * page; an extra key is a translation nobody displays.
   *
   * Trivially true while English is the only catalogue, and the check that matters most
   * on the day a second one lands.
   */
  it.each(AVAILABLE_LOCALES)("has the same keys as the default catalogue: %s", (locale) => {
    const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return value !== null && typeof value === "object"
          ? flatten(value as Record<string, unknown>, path)
          : [path];
      });

    const read = (l: string) =>
      flatten(JSON.parse(readFileSync(join(MESSAGES_DIR, `${l}.json`), "utf8"))).sort();

    expect(read(locale)).toEqual(read(DEFAULT_LOCALE));
  });
});

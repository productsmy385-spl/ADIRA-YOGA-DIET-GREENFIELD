import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from "./locales";

/**
 * Per-request locale resolution for next-intl.
 *
 * There is no locale in the URL (decisions/ADR-010), so the locale is negotiated here
 * from the cookie and the Accept-Language header.
 *
 * The signed-in user's saved preference is deliberately NOT read here. This runs before
 * any session exists in the request pipeline, and reaching for the database from a
 * function that renders every page — including signed-out ones — would put a query on
 * the critical path of the marketing page. Phase 2 will write the user's preference into
 * the cookie at sign-in instead, which keeps this resolution synchronous and cheap while
 * still honouring the choice.
 */
async function loadMessages(locale: string) {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    console.error(
      `[i18n] No message catalogue for "${locale}". Falling back to ${DEFAULT_LOCALE}. ` +
        `A locale must not be listed in AVAILABLE_LOCALES until messages/${locale}.json exists.`,
    );
    return (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
  }
}

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return {
    locale,
    // Belt and braces. `resolveLocale` only returns locales that have a catalogue, so
    // this import should never fail — but it did once, returning HTTP 500 to any
    // browser sending `Accept-Language: te-IN`, and a missing translation file must
    // degrade to English rather than take the page down.
    messages: await loadMessages(locale),
    // A missing translation falls back to English rather than rendering the raw key.
    // Showing "customer.dashboard.greeting" to a person is worse than showing English.
    onError() {},
    getMessageFallback({ key }) {
      return key.split(".").pop() ?? key;
    },
  };
});

export { DEFAULT_LOCALE };

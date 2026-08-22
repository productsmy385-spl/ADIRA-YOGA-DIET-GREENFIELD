"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { isLocale, LOCALE_COOKIE } from "./locales";

/**
 * Persist a language choice.
 *
 * A server action rather than a client-side `document.cookie` write, for two reasons:
 * the cookie is `HttpOnly`, and the pages that read it are server-rendered — so the
 * choice has to be made server-side and the route revalidated, or the user changes
 * language and sees the old one until they navigate.
 *
 * The value is validated rather than trusted. This is reachable by anyone who can post
 * to the action, and writing an unvalidated string into a cookie that later feeds a
 * dynamic import path (`messages/${locale}.json`) is a path-traversal invitation.
 * `isLocale` is an allowlist, which is the only form of validation that closes that.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error("Unsupported locale.");
  }

  const store = await cookies();

  store.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A year. A language preference is not sensitive and should outlive a session —
    // making someone re-choose their language on every visit is its own accessibility
    // failure for the people who most need a non-default language.
    maxAge: 60 * 60 * 24 * 365,
  });

  // Every translated page is server-rendered, so the whole tree has to re-render for
  // the change to be visible.
  revalidatePath("/", "layout");
}

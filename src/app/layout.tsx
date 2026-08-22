import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { LOCALE_DIRECTION, type Locale } from "@/i18n/locales";
import { branding } from "@/lib/branding";

import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(branding.url),
  title: {
    default: `${branding.name} — ${branding.tagline}`,
    template: `%s · ${branding.name}`,
  },
  description: branding.description,
  applicationName: branding.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: branding.name, statusBarStyle: "default" },
  // Adira is private, authenticated software. Nothing here belongs in a search index.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: branding.backgroundColor },
    { media: "(prefers-color-scheme: dark)", color: branding.themeColor },
  ],
  width: "device-width",
  initialScale: 1,
  // Not `maximum-scale=1`: blocking pinch-zoom is an accessibility failure, and this is
  // health software that older customers will use.
  viewportFit: "cover",
};

/**
 * Applies the stored or system colour scheme before first paint.
 *
 * Inline and synchronous on purpose. Deferring this to a React effect means the page
 * renders light, then flips to dark — unpleasant generally, and genuinely unkind in an
 * app someone may open at 5am before a morning practice.
 */
const themeScript = `
  try {
    var stored = localStorage.getItem('adira-theme');
    var dark = stored ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolved per request from the cookie and Accept-Language (ADR-010). `lang` and `dir`
  // must reflect it: a screen reader picks its pronunciation from `lang`, so a page of
  // Telugu marked `lang="en"` is read aloud as mangled English.
  const locale = (await getLocale()) as Locale;

  return (
    <html lang={locale} dir={LOCALE_DIRECTION[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${sans.variable} ${mono.variable}`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

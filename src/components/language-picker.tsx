"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import { AVAILABLE_LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Language picker.
 *
 * A NATIVE `<select>`, deliberately, where the rest of the design system uses Radix.
 * Three reasons, and they all point the same way for this particular control:
 *
 *  - It works before JavaScript loads. The person most likely to need this control is
 *    someone who cannot read the current interface language, and asking them to wait for
 *    hydration to escape a language they cannot read is the wrong trade.
 *  - Mobile browsers render it as the platform's own picker, which is scrollable,
 *    searchable, and already familiar — better than anything we would build.
 *  - Keyboard and screen-reader support are native and complete, with no focus
 *    management to get wrong.
 *
 * A custom listbox would look more consistent with the rest of the UI and be worse at
 * the one job this control has.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const t = useTranslations("language");
  const current = useLocale() as Locale;
  const selectId = useId();
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as Locale;
    if (next === current) return;

    startTransition(async () => {
      await setLocale(next);
    });
  }

  return (
    <div className={cn("relative", className)}>
      {/* Visually hidden rather than absent: the select needs a programmatic label, and
          an icon alone is not one. */}
      <label htmlFor={selectId} className="sr-only">
        {t("change")}
      </label>

      <Languages
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />

      <select
        id={selectId}
        value={current}
        onChange={onChange}
        disabled={pending}
        className="h-9 appearance-none rounded-md border border-border bg-card py-1 pr-8 pl-8 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {AVAILABLE_LOCALES.map((locale) => (
          // Each option carries its own `lang`, so a screen reader pronounces
          // "తెలుగు" with Telugu phonetics rather than attempting it as English.
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { Mail, MapPin, Menu, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  SERVICE_LABELS,
  brandColorUsage,
  type SectionId,
  type WebsiteContent,
} from "@/server/website/content";
import { templateMeta } from "@/server/website/templates";

/**
 * Shared building blocks for the eight public-site templates (WEBSITE-BUILDER-PRD §4).
 *
 * Templates differ in LAYOUT; these atoms make sure they never differ in SAFETY:
 *   - every value is rendered as React text — no tenant HTML anywhere (NFR-SEC-WEB-003);
 *   - every link was already restricted to https:/mailto:/tel: by the content schema;
 *   - external links get rel="noopener noreferrer".
 * Server components only: a public site ships no JavaScript of its own. The mobile menu
 * is a native <details>, which works without script and needs no CSP exception.
 */

export interface SiteProps {
  content: WebsiteContent;
  templateKey: string;
  /** Where Sign In and Request access go (FR-WEB-014). */
  signInHref: string;
  requestAccessHref: string;
}

export const SECTION_ANCHOR: Record<SectionId, string> = {
  hero: "top",
  about: "about",
  services: "services",
  team: "team",
  offerings: "offerings",
  contact: "contact",
};

const SECTION_NAV_LABEL: Partial<Record<SectionId, string>> = {
  about: "About",
  services: "Services",
  team: "Team",
  offerings: "Programmes",
  contact: "Contact",
};

/**
 * Sections in display order that are switched on AND have something to show — an empty
 * Team section renders nothing rather than a heading over a blank space.
 */
export function visibleSections(content: WebsiteContent): SectionId[] {
  const hasContent: Record<SectionId, boolean> = {
    hero: true,
    about: Boolean(content.about.intro || content.about.mission || content.about.philosophy),
    services: content.services.some((s) => s.enabled),
    team: content.team.length > 0,
    offerings: content.offerings.length > 0,
    contact: Boolean(
      content.contact.phone || content.contact.email || content.contact.address || content.contact.mapsUrl,
    ),
  };
  return content.sections.filter((s) => s.visible && hasContent[s.id]).map((s) => s.id);
}

/** Palette, font and custom brand colour applied once, at the page root. */
export function SiteRoot({
  content,
  templateKey,
  className,
  children,
}: {
  content: WebsiteContent;
  templateKey: string;
  className?: string;
  children: ReactNode;
}) {
  const meta = templateMeta(templateKey);
  const palette = content.branding.palette ?? meta?.defaultPalette ?? "mint";
  const font = content.branding.font ?? meta?.defaultFont ?? "modern";
  const custom = content.branding.customColor;

  // A custom colour is tenant DATA, set as a variable — not a literal in src/ (invariant 7).
  const style: CSSProperties | undefined = custom
    ? ({
        "--site-primary": custom,
        "--site-primary-fg":
          brandColorUsage(custom).foreground === "light" ? "var(--site-ink-light)" : "var(--site-ink-dark)",
      } as CSSProperties)
    : undefined;

  return (
    <div
      id="top"
      style={style}
      className={cn(
        "site min-h-dvh",
        palette !== "mint" && `site-palette-${palette}`,
        font !== "modern" && `site-font-${font}`,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function isExternal(href: string): boolean {
  return href.startsWith("https://");
}

export function ExtLink({
  href,
  className,
  children,
  label,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={className}
      {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-primary";

export function PrimaryButton({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <ExtLink href={href} className={cn(BUTTON_BASE, "bg-site-primary text-site-primary-fg", className)}>
      {children}
    </ExtLink>
  );
}

export function GhostButton({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <ExtLink href={href} className={cn(BUTTON_BASE, "border border-site-border text-site-fg", className)}>
      {children}
    </ExtLink>
  );
}

/** The tenant's own hero calls to action, only when both label and link are set. */
export function HeroActions({ content, className }: { content: WebsiteContent; className?: string }) {
  const { primary, secondary } = content.hero;
  if (!primary.label && !secondary.label) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {primary.label && primary.href ? <PrimaryButton href={primary.href}>{primary.label}</PrimaryButton> : null}
      {secondary.label && secondary.href ? <GhostButton href={secondary.href}>{secondary.label}</GhostButton> : null}
    </div>
  );
}

/** Image when one is set; otherwise a decorative shape, never a broken <img>. */
export function SiteImage({
  image,
  className,
  shape = "soft",
}: {
  image: { url: string | null; alt: string };
  className?: string;
  shape?: "soft" | "blob" | "bars";
}) {
  if (image.url) {
    // eslint-disable-next-line @next/next/no-img-element -- tenant media from ImageKit
    return <img src={image.url} alt={image.alt} loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden bg-site-surface",
        shape === "blob" && "rounded-[42%_58%_63%_37%/45%_40%_60%_55%]",
        className,
      )}
    >
      <span className="absolute -top-1/4 -left-1/4 size-3/4 rounded-full bg-site-primary/25 blur-2xl" />
      <span className="absolute -right-1/4 -bottom-1/4 size-3/4 rounded-full bg-site-accent/35 blur-2xl" />
      {shape === "bars" ? (
        <span className="absolute inset-x-6 bottom-6 flex h-1/3 items-end gap-2">
          {[60, 85, 45, 100, 70].map((h) => (
            <span key={h} className="flex-1 rounded-t-md bg-site-primary/40" style={{ height: `${h}%` }} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  className,
  align = "start",
}: {
  eyebrow?: string;
  title: string;
  className?: string;
  align?: "start" | "center";
}) {
  return (
    <div className={cn(align === "center" && "text-center", className)}>
      {eyebrow ? (
        <p className="text-xs font-bold tracking-[0.18em] text-site-primary uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 font-site-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
    </div>
  );
}

/** Multi-line plain text: newlines kept, nothing interpreted. */
export function Prose({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  return <p className={cn("whitespace-pre-line leading-relaxed text-site-muted", className)}>{children}</p>;
}

export function enabledServices(content: WebsiteContent) {
  return content.services
    .filter((s) => s.enabled)
    .map((s) => ({ ...s, label: SERVICE_LABELS[s.key] }));
}

export function ContactList({ content, className }: { content: WebsiteContent; className?: string }) {
  const { phone, email, address, mapsUrl } = content.contact;
  return (
    <ul className={cn("space-y-3 text-sm", className)}>
      {phone ? (
        <li className="flex items-start gap-3">
          <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-site-primary" />
          <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} className="underline-offset-4 hover:underline">
            {phone}
          </a>
        </li>
      ) : null}
      {email ? (
        <li className="flex items-start gap-3">
          <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-site-primary" />
          <a href={`mailto:${email}`} className="break-all underline-offset-4 hover:underline">
            {email}
          </a>
        </li>
      ) : null}
      {address ? (
        <li className="flex items-start gap-3">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-site-primary" />
          <span className="whitespace-pre-line">
            {address}
            {mapsUrl ? (
              <>
                {" · "}
                <ExtLink href={mapsUrl} className="font-semibold text-site-primary underline-offset-4 hover:underline">
                  Open in Maps
                </ExtLink>
              </>
            ) : null}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

const SOCIAL_LABELS: Record<keyof WebsiteContent["social"], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

export function SocialLinks({ content, className }: { content: WebsiteContent; className?: string }) {
  const entries = (Object.keys(SOCIAL_LABELS) as Array<keyof typeof SOCIAL_LABELS>).filter(
    (k) => content.social[k],
  );
  if (entries.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {entries.map((k) => (
        <li key={k}>
          <ExtLink
            href={content.social[k]}
            className="inline-flex min-h-9 items-center rounded-full border border-site-border px-3 text-xs font-semibold hover:bg-site-surface"
          >
            {SOCIAL_LABELS[k]}
          </ExtLink>
        </li>
      ))}
    </ul>
  );
}

function Brand({ content, inverse }: { content: WebsiteContent; inverse?: boolean }) {
  const { logo, businessName, tagline } = content.branding;
  return (
    <a href="#top" className="flex min-w-0 items-center gap-3">
      {logo.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant logo
        <img src={logo.url} alt={logo.alt || businessName} className="size-10 shrink-0 rounded-xl object-contain" />
      ) : (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-site-primary font-site-display text-lg font-bold text-site-primary-fg"
        >
          {businessName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-site-display text-lg font-bold leading-tight">{businessName}</span>
        {tagline ? (
          <span className={cn("block truncate text-xs", inverse ? "opacity-80" : "text-site-muted")}>{tagline}</span>
        ) : null}
      </span>
    </a>
  );
}

/**
 * The header every template uses, in one of four arrangements. Sign In is in the desktop
 * header AND the mobile menu, on every template (FR-WEB-014).
 */
export function SiteHeader({
  site,
  variant = "bar",
}: {
  site: SiteProps;
  variant?: "bar" | "centered" | "floating" | "solid";
}) {
  const nav = visibleSections(site.content)
    .filter((id) => SECTION_NAV_LABEL[id])
    .map((id) => ({ href: `#${SECTION_ANCHOR[id]}`, label: SECTION_NAV_LABEL[id]! }));

  const navLinks = (className: string) =>
    nav.map((item) => (
      <a key={item.href} href={item.href} className={className}>
        {item.label}
      </a>
    ));

  const signIn = (
    <a href={site.signInHref} className={cn(BUTTON_BASE, "min-h-10 bg-site-primary px-4 text-site-primary-fg")}>
      Sign in
    </a>
  );

  return (
    <header
      className={cn(
        "relative z-20",
        variant === "floating" && "absolute inset-x-0 top-0",
        variant === "solid" && "bg-site-primary text-site-primary-fg",
        variant === "bar" && "border-b border-site-border bg-site-bg/90 backdrop-blur",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6",
          variant === "centered" && "lg:flex-col lg:gap-3 lg:py-6",
        )}
      >
        <Brand content={site.content} inverse={variant === "solid"} />

        <nav aria-label="Site" className="hidden items-center gap-6 text-sm font-medium lg:flex">
          {navLinks("opacity-80 hover:opacity-100")}
          {variant === "solid" ? (
            <a href={site.signInHref} className={cn(BUTTON_BASE, "min-h-10 bg-site-bg px-4 text-site-fg")}>
              Sign in
            </a>
          ) : (
            signIn
          )}
        </nav>

        {/* Mobile: native disclosure. Sign In first, so it is never below the fold. */}
        <details className="group relative lg:hidden">
          <summary
            aria-label="Menu"
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-site-border [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </summary>
          <div className="absolute top-full right-0 mt-2 w-60 rounded-2xl border border-site-border bg-site-bg p-3 text-site-fg shadow-xl">
            <a href={site.signInHref} className={cn(BUTTON_BASE, "w-full bg-site-primary text-site-primary-fg")}>
              Sign in
            </a>
            <nav aria-label="Site menu" className="mt-2 flex flex-col">
              {navLinks("rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-site-surface")}
              <a href={site.requestAccessHref} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-site-surface">
                Request access
              </a>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ site, className }: { site: SiteProps; className?: string }) {
  const { content } = site;
  const year = new Date().getFullYear();
  return (
    <footer className={cn("border-t border-site-border", className)}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-site-display text-lg font-bold">{content.branding.businessName}</p>
          {content.footer.text ? <Prose className="mt-2 text-sm">{content.footer.text}</Prose> : null}
          <SocialLinks content={content} className="mt-4" />
        </div>
        <ContactList content={content} />
        <div className="flex flex-col items-start gap-2 text-sm">
          <a href={site.signInHref} className="font-semibold text-site-primary underline-offset-4 hover:underline">
            Member sign in
          </a>
          <a href={site.requestAccessHref} className="underline-offset-4 hover:underline">
            Request access
          </a>
        </div>
      </div>
      <p className="border-t border-site-border px-4 py-4 text-center text-xs text-site-muted">
        © {year} {content.branding.businessName}
      </p>
    </footer>
  );
}

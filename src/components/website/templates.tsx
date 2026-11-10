import type { ReactNode } from "react";
import { ArrowRight, Check, Clock } from "lucide-react";

import type { SectionId } from "@/server/website/content";
import type { TemplateKey } from "@/server/website/templates";

import {
  ContactList,
  HeroActions,
  PrimaryButton,
  Prose,
  SECTION_ANCHOR,
  SectionHeading,
  SiteFooter,
  SiteHeader,
  SiteImage,
  SiteRoot,
  SocialLinks,
  enabledServices,
  visibleSections,
  type SiteProps,
} from "./site-parts";

/**
 * The eight public-site templates (WEBSITE-BUILDER-PRD §4).
 *
 * Each is a different LAYOUT over the same content document: header arrangement, hero
 * composition and how services, team and offerings are laid out all differ. None owns
 * content, which is why switching template can never lose any (FR-WEB-003).
 */

type Renderers = Partial<Record<SectionId, () => ReactNode>>;

/** Renders the visible sections in the Admin's chosen order. */
function Sections({ site, renderers }: { site: SiteProps; renderers: Renderers }) {
  return (
    <>
      {visibleSections(site.content).map((id) => {
        const render = renderers[id];
        return render ? (
          <section key={id} id={id === "hero" ? undefined : SECTION_ANCHOR[id]} className="scroll-mt-20">
            {render()}
          </section>
        ) : null;
      })}
    </>
  );
}

const WRAP = "mx-auto max-w-6xl px-4 sm:px-6";
const PAD = "py-16 sm:py-24";

/* ── 1. Wellness Minimal — single column, text-led, hairlines ───────────── */

function Minimal(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="bar" />
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className="py-20 sm:py-28">
                <p className="text-sm font-semibold text-site-primary">{c.branding.tagline}</p>
                <h1 className="mt-4 font-site-display text-4xl font-bold tracking-tight text-balance sm:text-6xl">
                  {c.hero.heading}
                </h1>
                <Prose className="mt-6 text-lg">{c.hero.text}</Prose>
                <HeroActions content={c} className="mt-8" />
              </div>
            ),
            about: () => (
              <div className="border-t border-site-border py-14">
                <SectionHeading title="About us" />
                <Prose className="mt-5">{c.about.intro}</Prose>
                {c.about.mission ? <Prose className="mt-4">{c.about.mission}</Prose> : null}
                {c.about.philosophy ? <Prose className="mt-4">{c.about.philosophy}</Prose> : null}
              </div>
            ),
            services: () => (
              <div className="border-t border-site-border py-14">
                <SectionHeading title="What we offer" />
                <dl className="mt-6 divide-y divide-site-border">
                  {enabledServices(c).map((s) => (
                    <div key={s.key} className="py-4">
                      <dt className="font-semibold">{s.label}</dt>
                      {s.description ? <dd className="mt-1 text-sm text-site-muted">{s.description}</dd> : null}
                    </div>
                  ))}
                </dl>
              </div>
            ),
            team: () => (
              <div className="border-t border-site-border py-14">
                <SectionHeading title="Our teachers" />
                <ul className="mt-6 space-y-6">
                  {c.team.map((m, i) => (
                    <li key={i} className="flex gap-4">
                      <SiteImage image={m.photo} className="size-16 shrink-0 rounded-full" />
                      <div>
                        <p className="font-semibold">{m.name}</p>
                        <p className="text-sm text-site-primary">{m.role}</p>
                        {m.qualifications ? <p className="mt-1 text-sm text-site-muted">{m.qualifications}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className="border-t border-site-border py-14">
                <SectionHeading title="Programmes" />
                <ul className="mt-6 space-y-5">
                  {c.offerings.map((o, i) => (
                    <li key={i}>
                      <p className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
                        {o.name}
                        <span className="text-sm font-normal text-site-muted">
                          {[o.duration, c.pricingEnabled ? o.price : ""].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                      {o.description ? <p className="mt-1 text-sm text-site-muted">{o.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            contact: () => (
              <div className="border-t border-site-border py-14">
                <SectionHeading title="Get in touch" />
                <ContactList content={c} className="mt-6" />
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 2. Yoga Retreat — full-bleed image hero, class grid, instructor cards ─ */

function Retreat(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="bar" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className="relative isolate min-h-[70dvh] overflow-hidden">
                <SiteImage image={c.hero.image} className="absolute inset-0 -z-10 size-full" />
                <div className="absolute inset-0 -z-10 bg-linear-to-t from-site-bg via-site-bg/70 to-site-bg/10" />
                <div className={`${WRAP} flex min-h-[70dvh] flex-col justify-end pb-16`}>
                  <h1 className="max-w-3xl font-site-display text-4xl font-bold tracking-tight text-balance sm:text-6xl">
                    {c.hero.heading}
                  </h1>
                  <Prose className="mt-5 max-w-2xl text-lg text-site-fg/80">{c.hero.text}</Prose>
                  <HeroActions content={c} className="mt-8" />
                </div>
              </div>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD} grid gap-10 md:grid-cols-2`}>
                <SectionHeading eyebrow="Our practice" title={c.branding.tagline || "About the studio"} />
                <div className="space-y-4">
                  <Prose>{c.about.intro}</Prose>
                  <Prose>{c.about.philosophy}</Prose>
                </div>
              </div>
            ),
            services: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading eyebrow="Classes" title="Find your practice" />
                  <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {enabledServices(c).map((s) => (
                      <li key={s.key} className="rounded-3xl border border-site-border bg-site-bg p-6">
                        <span aria-hidden className="block h-1.5 w-10 rounded-full bg-site-accent" />
                        <p className="mt-4 font-site-display text-xl font-semibold">{s.label}</p>
                        {s.description ? <p className="mt-2 text-sm text-site-muted">{s.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            team: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading eyebrow="Instructors" title="Meet your teachers" />
                <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {c.team.map((m, i) => (
                    <li key={i} className="overflow-hidden rounded-3xl border border-site-border">
                      <SiteImage image={m.photo} className="aspect-[4/3] w-full" />
                      <div className="p-5">
                        <p className="font-site-display text-lg font-semibold">{m.name}</p>
                        <p className="text-sm text-site-primary">{m.role}</p>
                        {m.specialisations ? <p className="mt-2 text-sm text-site-muted">{m.specialisations}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading eyebrow="Schedule" title="Programmes" />
                  <ul className="mt-8 divide-y divide-site-border rounded-3xl border border-site-border bg-site-bg">
                    {c.offerings.map((o, i) => (
                      <li key={i} className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">{o.name}</p>
                          {o.description ? <p className="text-sm text-site-muted">{o.description}</p> : null}
                        </div>
                        <p className="flex shrink-0 items-center gap-2 text-sm text-site-muted">
                          {o.duration ? (
                            <>
                              <Clock aria-hidden className="size-4" />
                              {o.duration}
                            </>
                          ) : null}
                          {c.pricingEnabled && o.price ? <span className="font-semibold text-site-fg">{o.price}</span> : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD} grid gap-8 md:grid-cols-2`}>
                <SectionHeading eyebrow="Visit" title="Come and practise with us" />
                <ContactList content={c} />
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 3. Modern Fitness — split hero, highlight strip, alternating rows ──── */

function Fitness(site: SiteProps) {
  const { content: c } = site;
  const services = enabledServices(c);
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="bar" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <>
                <div className={`${WRAP} grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20`}>
                  <div>
                    <h1 className="font-site-display text-5xl font-black tracking-tight text-balance uppercase sm:text-7xl">
                      {c.hero.heading}
                    </h1>
                    <Prose className="mt-6 text-lg">{c.hero.text}</Prose>
                    <HeroActions content={c} className="mt-8" />
                  </div>
                  <SiteImage image={c.hero.image} shape="bars" className="aspect-square w-full rounded-[2rem]" />
                </div>
                {services.length > 0 ? (
                  <div className="bg-site-primary text-site-primary-fg">
                    <ul className={`${WRAP} flex flex-wrap justify-center gap-x-8 gap-y-2 py-4 text-sm font-bold tracking-wider uppercase`}>
                      {services.map((s) => (
                        <li key={s.key}>{s.label}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD}`}>
                <div className="rounded-[2rem] bg-site-surface p-8 sm:p-12">
                  <SectionHeading title="Built around you" />
                  <div className="mt-6 grid gap-6 md:grid-cols-3">
                    <Prose>{c.about.intro}</Prose>
                    <Prose>{c.about.mission}</Prose>
                    <Prose>{c.about.philosophy}</Prose>
                  </div>
                </div>
              </div>
            ),
            services: () => (
              <div className={`${WRAP} ${PAD} space-y-6`}>
                <SectionHeading title="Train with purpose" />
                {services.map((s, i) => (
                  <div key={s.key} className={`grid items-center gap-6 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
                    <SiteImage image={{ url: null, alt: "" }} className="aspect-[16/9] w-full rounded-3xl" />
                    <div>
                      <p className="font-site-display text-2xl font-bold">{s.label}</p>
                      {s.description ? <p className="mt-2 text-site-muted">{s.description}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ),
            team: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading title="Coaches" />
                <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {c.team.map((m, i) => (
                    <li key={i}>
                      <SiteImage image={m.photo} className="aspect-[3/4] w-full rounded-2xl" />
                      <p className="mt-3 font-bold">{m.name}</p>
                      <p className="text-sm text-site-muted">{m.role}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className="bg-site-fg text-site-bg">
                <div className={`${WRAP} ${PAD}`}>
                  <h2 className="font-site-display text-4xl font-black uppercase">Programmes</h2>
                  <ul className="mt-8 grid gap-4 md:grid-cols-3">
                    {c.offerings.map((o, i) => (
                      <li key={i} className="rounded-3xl border border-site-bg/20 p-6">
                        <p className="text-xl font-bold">{o.name}</p>
                        <p className="mt-1 text-sm opacity-75">{[o.duration, c.pricingEnabled ? o.price : ""].filter(Boolean).join(" · ")}</p>
                        {o.description ? <p className="mt-3 text-sm opacity-85">{o.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD} text-center`}>
                <h2 className="font-site-display text-4xl font-black uppercase">Start today</h2>
                <ContactList content={c} className="mx-auto mt-6 inline-block text-left" />
                <div className="mt-8">
                  <PrimaryButton href={site.requestAccessHref}>
                    Request access <ArrowRight aria-hidden className="ml-1 size-4" />
                  </PrimaryButton>
                </div>
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 4. Holistic Wellness — organic shapes, centred narrative ───────────── */

function Holistic(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="centered" />
      <main className="overflow-hidden">
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className={`${WRAP} relative py-16 text-center sm:py-24`}>
                <SiteImage image={c.hero.image} shape="blob" className="mx-auto aspect-square w-64 sm:w-80" />
                <h1 className="mx-auto mt-10 max-w-3xl font-site-display text-4xl font-semibold text-balance sm:text-6xl">
                  {c.hero.heading}
                </h1>
                <Prose className="mx-auto mt-5 max-w-xl text-lg">{c.hero.text}</Prose>
                <HeroActions content={c} className="mt-8 justify-center" />
              </div>
            ),
            about: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD} mx-auto max-w-2xl text-center`}>
                  <SectionHeading align="center" eyebrow="Philosophy" title="A gentler path to wellbeing" />
                  <Prose className="mt-6 text-lg">{c.about.philosophy || c.about.intro}</Prose>
                  {c.about.philosophy && c.about.intro ? <Prose className="mt-4">{c.about.intro}</Prose> : null}
                </div>
              </div>
            ),
            services: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading align="center" title="Ways to practise" />
                <ul className="mt-10 flex flex-wrap justify-center gap-4">
                  {enabledServices(c).map((s) => (
                    <li
                      key={s.key}
                      className="w-full max-w-xs rounded-[2.5rem_1rem_2.5rem_1rem] bg-site-surface p-6 text-center sm:w-72"
                    >
                      <p className="font-site-display text-xl">{s.label}</p>
                      {s.description ? <p className="mt-2 text-sm text-site-muted">{s.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            team: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading align="center" title="Guides" />
                <ul className="mt-10 flex flex-wrap justify-center gap-10">
                  {c.team.map((m, i) => (
                    <li key={i} className="w-48 text-center">
                      <SiteImage image={m.photo} shape="blob" className="mx-auto size-40" />
                      <p className="mt-4 font-site-display text-lg">{m.name}</p>
                      <p className="text-sm text-site-muted">{m.role}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD} mx-auto max-w-3xl`}>
                  <SectionHeading align="center" title="Journeys" />
                  <ol className="mt-10 space-y-8">
                    {c.offerings.map((o, i) => (
                      <li key={i} className="flex gap-5">
                        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-site-accent font-semibold text-site-fg">
                          {i + 1}
                        </span>
                        <div>
                          <p className="font-site-display text-lg">{o.name}</p>
                          <p className="text-sm text-site-muted">{[o.duration, c.pricingEnabled ? o.price : ""].filter(Boolean).join(" · ")}</p>
                          {o.description ? <p className="mt-2 text-site-muted">{o.description}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD} text-center`}>
                <SectionHeading align="center" title="Begin your journey" />
                <ContactList content={c} className="mx-auto mt-6 inline-block text-left" />
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 5. Nutrition Studio — menu-style offerings, warm bands ─────────────── */

function Nutrition(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="solid" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} grid items-center gap-8 py-14 md:grid-cols-[3fr_2fr]`}>
                  <div>
                    <h1 className="font-site-display text-4xl font-bold text-balance sm:text-5xl">{c.hero.heading}</h1>
                    <Prose className="mt-5 text-lg">{c.hero.text}</Prose>
                    <HeroActions content={c} className="mt-7" />
                  </div>
                  <SiteImage image={c.hero.image} className="aspect-square w-full rounded-full" />
                </div>
              </div>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD} grid gap-8 md:grid-cols-2`}>
                <div>
                  <SectionHeading eyebrow="Our approach" title="Food that fits your life" />
                  <Prose className="mt-5">{c.about.intro}</Prose>
                </div>
                <div className="rounded-3xl border-l-4 border-site-accent bg-site-surface p-6">
                  <Prose>{c.about.mission || c.about.philosophy}</Prose>
                </div>
              </div>
            ),
            services: () => (
              <div className="bg-site-accent/25">
                <div className={`${WRAP} py-12`}>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {enabledServices(c).map((s) => (
                      <li key={s.key} className="flex gap-3 rounded-2xl bg-site-bg p-4">
                        <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-site-primary" />
                        <span>
                          <span className="font-semibold">{s.label}</span>
                          {s.description ? <span className="block text-sm text-site-muted">{s.description}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            offerings: () => (
              <div className={`${WRAP} ${PAD} mx-auto max-w-3xl`}>
                <SectionHeading align="center" eyebrow="Menu" title="Meal programmes" />
                <ul className="mt-10 space-y-6">
                  {c.offerings.map((o, i) => (
                    <li key={i}>
                      <p className="flex items-baseline gap-3 font-site-display text-lg font-semibold">
                        <span>{o.name}</span>
                        <span aria-hidden className="flex-1 border-b border-dotted border-site-muted/50" />
                        <span className="text-site-primary">{c.pricingEnabled && o.price ? o.price : o.duration}</span>
                      </p>
                      {o.description ? <p className="mt-1 text-sm text-site-muted">{o.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            team: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading title="Our nutritionists" />
                  <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                    {c.team.map((m, i) => (
                      <li key={i} className="flex items-center gap-4 rounded-2xl bg-site-bg p-4">
                        <SiteImage image={m.photo} className="size-20 shrink-0 rounded-2xl" />
                        <div>
                          <p className="font-semibold">{m.name}</p>
                          <p className="text-sm text-site-primary">{m.role}</p>
                          {m.qualifications ? <p className="text-xs text-site-muted">{m.qualifications}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading title="Book a consultation" />
                <ContactList content={c} className="mt-6" />
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 6. Premium Wellness — dark, serif display, editorial two-column ────── */

function Premium(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="floating" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className={`${WRAP} grid min-h-[85dvh] items-end gap-10 pt-28 pb-16 lg:grid-cols-[1.3fr_1fr]`}>
                <div>
                  <p className="text-xs tracking-[0.3em] text-site-accent uppercase">{c.branding.tagline}</p>
                  <h1 className="mt-6 font-site-display text-5xl leading-[1.05] text-balance sm:text-7xl">{c.hero.heading}</h1>
                  <Prose className="mt-6 max-w-xl text-lg">{c.hero.text}</Prose>
                  <HeroActions content={c} className="mt-10" />
                </div>
                <SiteImage image={c.hero.image} className="aspect-[3/4] w-full rounded-t-full" />
              </div>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD} grid gap-12 border-t border-site-border lg:grid-cols-[1fr_2fr]`}>
                <h2 className="font-site-display text-3xl sm:text-4xl">Our story</h2>
                <div className="grid gap-8 sm:grid-cols-2">
                  <Prose>{c.about.intro}</Prose>
                  <div className="space-y-4">
                    <Prose>{c.about.mission}</Prose>
                    <Prose>{c.about.philosophy}</Prose>
                  </div>
                </div>
              </div>
            ),
            services: () => (
              <div className={`${WRAP} ${PAD} border-t border-site-border`}>
                <h2 className="font-site-display text-3xl sm:text-4xl">Services</h2>
                <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-site-border sm:grid-cols-2 lg:grid-cols-3">
                  {enabledServices(c).map((s) => (
                    <li key={s.key} className="bg-site-bg p-8">
                      <p className="font-site-display text-xl">{s.label}</p>
                      {s.description ? <p className="mt-3 text-sm text-site-muted">{s.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            team: () => (
              <div className={`${WRAP} ${PAD} border-t border-site-border`}>
                <h2 className="font-site-display text-3xl sm:text-4xl">Practitioners</h2>
                <ul className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                  {c.team.map((m, i) => (
                    <li key={i}>
                      <SiteImage image={m.photo} className="aspect-[4/5] w-full rounded-xl grayscale" />
                      <p className="mt-4 font-site-display text-xl">{m.name}</p>
                      <p className="text-xs tracking-[0.2em] text-site-accent uppercase">{m.role}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <h2 className="font-site-display text-3xl sm:text-4xl">Programmes</h2>
                  <ul className="mt-10 divide-y divide-site-border">
                    {c.offerings.map((o, i) => (
                      <li key={i} className="grid gap-2 py-6 md:grid-cols-[1fr_2fr_auto] md:items-baseline">
                        <p className="font-site-display text-xl">{o.name}</p>
                        <p className="text-sm text-site-muted">{o.description}</p>
                        <p className="text-sm text-site-accent">{[o.duration, c.pricingEnabled ? o.price : ""].filter(Boolean).join(" · ")}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD} grid gap-8 md:grid-cols-2`}>
                <h2 className="font-site-display text-3xl sm:text-4xl">By appointment</h2>
                <div>
                  <ContactList content={c} />
                  <SocialLinks content={c} className="mt-6" />
                </div>
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 7. Community Wellness — team-first, photo mosaic ───────────────────── */

function Community(site: SiteProps) {
  const { content: c } = site;
  // People-first through layout (a team mosaic in the hero), while section ORDER stays
  // the Admin's choice like every other template.
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="bar" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className={`${WRAP} grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-20`}>
                <div className="order-2 lg:order-1">
                  <h1 className="font-site-display text-4xl font-bold text-balance sm:text-5xl">{c.hero.heading}</h1>
                  <Prose className="mt-5 text-lg">{c.hero.text}</Prose>
                  <HeroActions content={c} className="mt-7" />
                </div>
                <div className="order-1 grid grid-cols-3 grid-rows-2 gap-3 lg:order-2">
                  <SiteImage image={c.hero.image} className="col-span-2 row-span-2 aspect-square rounded-3xl" />
                  <SiteImage image={c.team[0]?.photo ?? { url: null, alt: "" }} className="aspect-square rounded-3xl" />
                  <SiteImage image={c.team[1]?.photo ?? { url: null, alt: "" }} shape="blob" className="aspect-square" />
                </div>
              </div>
            ),
            team: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading align="center" eyebrow="Our people" title="The friendly faces you'll meet" />
                  <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                    {c.team.map((m, i) => (
                      <li key={i} className="text-center">
                        <SiteImage image={m.photo} className="mx-auto aspect-square w-full max-w-40 rounded-full ring-4 ring-site-bg" />
                        <p className="mt-3 font-semibold">{m.name}</p>
                        <p className="text-sm text-site-muted">{m.role}</p>
                        {m.specialisations ? <p className="mt-1 text-xs text-site-primary">{m.specialisations}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD} mx-auto max-w-3xl text-center`}>
                <SectionHeading align="center" title="More than a studio" />
                <Prose className="mt-5 text-lg">{c.about.intro}</Prose>
                <Prose className="mt-4">{c.about.mission}</Prose>
              </div>
            ),
            services: () => (
              <div className={`${WRAP} pb-16`}>
                <ul className="flex flex-wrap justify-center gap-3">
                  {enabledServices(c).map((s) => (
                    <li key={s.key} className="rounded-full bg-site-primary px-5 py-2.5 text-sm font-semibold text-site-primary-fg">
                      {s.label}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            offerings: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading title="Join a group" />
                <ul className="mt-8 grid gap-4 md:grid-cols-2">
                  {c.offerings.map((o, i) => (
                    <li key={i} className="rounded-3xl border-2 border-site-primary/30 p-6">
                      <p className="text-lg font-bold">{o.name}</p>
                      <p className="text-sm text-site-primary">{[o.duration, c.pricingEnabled ? o.price : ""].filter(Boolean).join(" · ")}</p>
                      {o.description ? <p className="mt-2 text-sm text-site-muted">{o.description}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ),
            contact: () => (
              <div className="bg-site-primary text-site-primary-fg">
                <div className={`${WRAP} ${PAD} grid gap-6 md:grid-cols-2 md:items-center`}>
                  <h2 className="font-site-display text-3xl font-bold">Come say hello</h2>
                  <div className="rounded-3xl bg-site-bg p-6 text-site-fg">
                    <ContactList content={c} />
                  </div>
                </div>
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

/* ── 8. Corporate Wellness — formal header, programme table ─────────────── */

function Corporate(site: SiteProps) {
  const { content: c } = site;
  return (
    <SiteRoot content={c} templateKey={site.templateKey}>
      <SiteHeader site={site} variant="solid" />
      <main>
        <Sections
          site={site}
          renderers={{
            hero: () => (
              <div className="border-b border-site-border">
                <div className={`${WRAP} grid gap-10 py-16 lg:grid-cols-[1.4fr_1fr] lg:py-24`}>
                  <div>
                    <p className="text-sm font-semibold text-site-primary">{c.branding.tagline}</p>
                    <h1 className="mt-3 font-site-display text-4xl font-bold text-balance sm:text-5xl">{c.hero.heading}</h1>
                    <Prose className="mt-5 text-lg">{c.hero.text}</Prose>
                    <HeroActions content={c} className="mt-8" />
                  </div>
                  <div className="rounded-2xl border border-site-border bg-site-surface p-6">
                    <p className="text-sm font-semibold">At a glance</p>
                    <ul className="mt-4 space-y-3 text-sm">
                      {enabledServices(c).map((s) => (
                        <li key={s.key} className="flex items-center gap-2">
                          <Check aria-hidden className="size-4 text-site-primary" />
                          {s.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ),
            about: () => (
              <div className={`${WRAP} ${PAD} grid gap-8 md:grid-cols-3`}>
                {[
                  ["Who we are", c.about.intro],
                  ["Our mission", c.about.mission],
                  ["Our approach", c.about.philosophy],
                ].map(([title, body]) =>
                  body ? (
                    <div key={title}>
                      <h3 className="font-site-display text-lg font-bold">{title}</h3>
                      <Prose className="mt-2 text-sm">{body}</Prose>
                    </div>
                  ) : null,
                )}
              </div>
            ),
            services: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading title="Services for your organisation" />
                  <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {enabledServices(c).map((s) => (
                      <li key={s.key} className="rounded-xl border border-site-border bg-site-bg p-5">
                        <p className="font-bold">{s.label}</p>
                        {s.description ? <p className="mt-1 text-sm text-site-muted">{s.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            offerings: () => (
              <div className={`${WRAP} ${PAD}`}>
                <SectionHeading title="Programmes" />
                <div className="mt-8 overflow-x-auto rounded-xl border border-site-border">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="bg-site-surface">
                      <tr>
                        <th scope="col" className="p-4 font-semibold">Programme</th>
                        <th scope="col" className="p-4 font-semibold">Duration</th>
                        {c.pricingEnabled ? <th scope="col" className="p-4 font-semibold">Price</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-site-border">
                      {c.offerings.map((o, i) => (
                        <tr key={i}>
                          <td className="p-4">
                            <p className="font-semibold">{o.name}</p>
                            {o.description ? <p className="text-site-muted">{o.description}</p> : null}
                          </td>
                          <td className="p-4 text-site-muted">{o.duration}</td>
                          {c.pricingEnabled ? <td className="p-4">{o.price}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
            team: () => (
              <div className="bg-site-surface">
                <div className={`${WRAP} ${PAD}`}>
                  <SectionHeading title="Leadership and practitioners" />
                  <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {c.team.map((m, i) => (
                      <li key={i}>
                        <SiteImage image={m.photo} className="aspect-square w-full rounded-lg" />
                        <p className="mt-3 font-bold">{m.name}</p>
                        <p className="text-sm text-site-muted">{m.role}</p>
                        {m.qualifications ? <p className="mt-1 text-xs text-site-muted">{m.qualifications}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
            contact: () => (
              <div className={`${WRAP} ${PAD} grid gap-6 md:grid-cols-2`}>
                <SectionHeading title="Talk to our team" />
                <ContactList content={c} />
              </div>
            ),
          }}
        />
      </main>
      <SiteFooter site={site} />
    </SiteRoot>
  );
}

const TEMPLATE_COMPONENTS: Record<TemplateKey, (site: SiteProps) => ReactNode> = {
  minimal: Minimal,
  retreat: Retreat,
  fitness: Fitness,
  holistic: Holistic,
  nutrition: Nutrition,
  premium: Premium,
  community: Community,
  corporate: Corporate,
};

/** Render a site with its template; an unknown key falls back to Minimal. */
export function RenderSite(site: SiteProps) {
  const Template = TEMPLATE_COMPONENTS[site.templateKey as TemplateKey] ?? Minimal;
  return <Template {...site} />;
}

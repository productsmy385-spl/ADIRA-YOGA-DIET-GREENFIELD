"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WebsiteStatus, WebsiteVersion } from "@/server/repositories/websites";
import {
  FONT_PAIRINGS,
  PALETTE_PRESETS,
  SECTION_IDS,
  SERVICE_KEYS,
  SERVICE_LABELS,
  type FieldProblem,
  type SectionId,
  type WebsiteContent,
} from "@/server/website/content";
import { TEMPLATES, type TemplateKey } from "@/server/website/templates";

import {
  changeTemplateAction,
  publishAction,
  republishAction,
  restoreVersionAction,
  saveDraftAction,
  unpublishAction,
  type ActionOutcome,
} from "./actions";
import { EditorSection, ImageField, TextAreaField, TextField, Toggle } from "./fields";

/**
 * The website editor (WEBSITE-BUILDER-PRD FR-WEB-001…016).
 *
 * Edits change local state immediately and autosave to the DRAFT after a short pause
 * (FR-WEB-007); the live site changes only on Publish. The preview iframes render the saved
 * draft, so they refresh after each save — "what you see is what Publish will put live".
 */

const STATUS_LABEL: Record<WebsiteStatus, { text: string; tone: string }> = {
  DRAFT: { text: "Draft — never published", tone: "bg-muted text-foreground" },
  PUBLISHED: { text: "Published", tone: "bg-accent-green/15 text-accent-green-ink" },
  CHANGES_PENDING: { text: "Published — changes pending", tone: "bg-accent-orange/15 text-accent-orange-ink" },
  UNPUBLISHED: { text: "Unpublished", tone: "bg-accent-red/12 text-accent-red-ink" },
};

const SECTION_LABEL: Record<SectionId, string> = {
  hero: "Hero",
  about: "About",
  services: "Services",
  team: "Team",
  offerings: "Programmes",
  contact: "Contact",
};

const DEVICES = {
  phone: { width: 390, label: "Phone", Icon: Smartphone },
  tablet: { width: 768, label: "Tablet", Icon: Tablet },
  desktop: { width: 1280, label: "Desktop", Icon: Monitor },
} as const;
type Device = keyof typeof DEVICES;

const PALETTE_LABEL: Record<(typeof PALETTE_PRESETS)[number], string> = {
  mint: "Mint",
  emerald: "Emerald",
  bold: "Bold green & blue",
  lavender: "Lavender",
  citrus: "Citrus",
  navy: "Navy (dark)",
  sunrise: "Sunrise",
  slate: "Slate",
};

const FONT_LABEL: Record<(typeof FONT_PAIRINGS)[number], string> = {
  modern: "Modern sans",
  editorial: "Editorial serif",
  friendly: "Friendly rounded",
  classic: "Classic serif",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function WebsiteEditor({
  initialContent,
  initialTemplate,
  initialStatus,
  versions,
  slug,
}: {
  initialContent: WebsiteContent;
  initialTemplate: string;
  initialStatus: WebsiteStatus;
  versions: WebsiteVersion[];
  slug: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [templateKey, setTemplateKey] = useState(initialTemplate);
  const [status, setStatus] = useState(initialStatus);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [notice, setNotice] = useState<ActionOutcome | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState<TemplateKey | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [showPreviewOnPhone, setShowPreviewOnPhone] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = useRef(false);

  /* ── autosave (draft only) ─────────────────────────────────────────── */
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      const result = await saveDraftAction(content);
      if (result.ok) {
        setSaveState("saved");
        setProblems([]);
        setPreviewVersion((v) => v + 1);
        setStatus((s) => (s === "PUBLISHED" ? "CHANGES_PENDING" : s));
      } else {
        setSaveState("error");
        setProblems(result.problems ?? []);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content]);

  function update(mutator: (draft: WebsiteContent) => void) {
    dirty.current = true;
    setSaveState("idle");
    setContent((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
  }

  const problemFor = (field: string) => problems.find((p) => p.field === field)?.message;
  const sectionHasProblem = (prefix: string) => problems.some((p) => p.field.startsWith(prefix));

  function run(action: () => Promise<ActionOutcome>, after?: (r: ActionOutcome) => void) {
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      if (!result.ok && result.problems) setProblems(result.problems);
      after?.(result);
    });
  }

  /* ── render ────────────────────────────────────────────────────────── */

  const previewSrc = `/admin/website/preview${previewTemplate ? `?template=${previewTemplate}` : ""}`;
  const statusInfo = STATUS_LABEL[status];
  const isPublishedEver = status !== "DRAFT";

  const preview = (
    <div className="rounded-2xl border border-border-glass bg-surface p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview size" className="flex gap-1">
          {(Object.keys(DEVICES) as Device[]).map((d) => {
            const { Icon, label } = DEVICES[d];
            return (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={device === d ? "default" : "ghost"}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
              >
                <Icon aria-hidden />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Button>
            );
          })}
        </div>
        {previewTemplate ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewTemplate(null)}>
            Back to my template
          </Button>
        ) : null}
      </div>
      <PreviewFrame src={previewSrc} width={DEVICES[device].width} reloadKey={previewVersion} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── status bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-glass bg-surface p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusInfo.tone)} role="status">
            {statusInfo.text}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {saveState === "saving" ? (
              <>
                <Loader2 aria-hidden className="size-3.5 animate-spin" /> Saving draft…
              </>
            ) : saveState === "saved" ? (
              <>
                <Check aria-hidden className="size-3.5" /> Draft saved
              </>
            ) : saveState === "error" ? (
              <span className="text-destructive">Not saved — check the highlighted fields</span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "PUBLISHED" || status === "CHANGES_PENDING" ? (
            <Button asChild size="sm" variant="ghost">
              <a href={`/s/${slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> View live site
              </a>
            </Button>
          ) : null}
          {status === "UNPUBLISHED" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(republishAction, (r) => r.ok && setStatus("PUBLISHED"))}
            >
              Put last version back online
            </Button>
          ) : null}
          {status === "PUBLISHED" || status === "CHANGES_PENDING" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Take your website offline? Visitors will see a not-found page. Your content is kept.")) {
                  run(unpublishAction, (r) => r.ok && setStatus("UNPUBLISHED"));
                }
              }}
            >
              Unpublish
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={pending || saveState === "saving"}
            onClick={() => run(publishAction, (r) => r.ok && setStatus("PUBLISHED"))}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {isPublishedEver ? "Publish changes" : "Publish website"}
          </Button>
        </div>
      </div>

      {notice ? (
        <Alert variant={notice.ok ? "default" : "destructive"}>
          <AlertDescription>
            {notice.message}
            {!notice.ok && notice.problems?.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {notice.problems.map((p) => (
                  <li key={p.field}>{p.message}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ── editing column ─────────────────────────────────────── */}
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full xl:hidden"
            aria-expanded={showPreviewOnPhone}
            onClick={() => setShowPreviewOnPhone((v) => !v)}
          >
            <Eye aria-hidden /> {showPreviewOnPhone ? "Hide preview" : "Show preview"}
          </Button>
          {showPreviewOnPhone ? <div className="xl:hidden">{preview}</div> : null}

          <EditorSection title="Template" summary={TEMPLATES.find((t) => t.key === templateKey)?.name} defaultOpen>
            <ul className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => {
                const current = t.key === templateKey;
                return (
                  <li
                    key={t.key}
                    className={cn(
                      "flex flex-col rounded-xl border p-3",
                      current ? "border-primary ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{t.layout}</p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Button type="button" size="xs" variant="ghost" onClick={() => setPreviewTemplate(t.key)}>
                        <Eye aria-hidden /> Preview
                      </Button>
                      {current ? (
                        <Badge variant="secondary">In use</Badge>
                      ) : confirmTemplate === t.key ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () => changeTemplateAction(t.key),
                                (r) => {
                                  if (r.ok) {
                                    setTemplateKey(t.key);
                                    setPreviewTemplate(null);
                                    setPreviewVersion((v) => v + 1);
                                    setStatus((s) => (s === "PUBLISHED" ? "CHANGES_PENDING" : s));
                                  }
                                  setConfirmTemplate(null);
                                },
                              )
                            }
                          >
                            Apply — keep my content
                          </Button>
                          <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmTemplate(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button type="button" size="xs" variant="outline" onClick={() => setConfirmTemplate(t.key)}>
                          Use this
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </EditorSection>

          <EditorSection title="Branding" attention={sectionHasProblem("branding")} summary={content.branding.businessName}>
            <TextField
              label="Business name"
              max={120}
              value={content.branding.businessName}
              error={problemFor("branding.businessName")}
              onChange={(v) => update((d) => void (d.branding.businessName = v))}
            />
            <TextField
              label="Tagline"
              max={160}
              value={content.branding.tagline}
              onChange={(v) => update((d) => void (d.branding.tagline = v))}
            />
            <div>
              <Label htmlFor="palette">Colours</Label>
              <select
                id="palette"
                value={content.branding.palette ?? ""}
                onChange={(e) =>
                  update((d) => void (d.branding.palette = (e.target.value || null) as WebsiteContent["branding"]["palette"]))
                }
                className="mt-1.5 h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Template default</option>
                {PALETTE_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PALETTE_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <TextField
                  label="Custom brand colour (optional)"
                  max={7}
                  placeholder="six-digit code"
                  value={content.branding.customColor}
                  error={problemFor("branding.customColor")}
                  hint="Text colour on it is chosen automatically for readability."
                  onChange={(v) => update((d) => void (d.branding.customColor = v))}
                />
              </div>
              <input
                type="color"
                aria-label="Pick brand colour"
                value={/^#[0-9a-f]{6}$/i.test(content.branding.customColor) ? content.branding.customColor : undefined}
                onChange={(e) => update((d) => void (d.branding.customColor = e.target.value))}
                className="mb-6 h-11 w-12 cursor-pointer rounded-md border border-input"
              />
            </div>
            <div>
              <Label htmlFor="font">Typography</Label>
              <select
                id="font"
                value={content.branding.font ?? ""}
                onChange={(e) =>
                  update((d) => void (d.branding.font = (e.target.value || null) as WebsiteContent["branding"]["font"]))
                }
                className="mt-1.5 h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Template default</option>
                {FONT_PAIRINGS.map((f) => (
                  <option key={f} value={f}>
                    {FONT_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ["logo", "Logo"],
                ["favicon", "Browser tab icon (favicon)"],
                ["cover", "Cover image"],
              ] as const
            ).map(([key, label]) => (
              <ImageField
                key={key}
                label={label}
                image={content.branding[key]}
                altError={problemFor(`branding.${key}.alt`)}
                onChange={(img) => update((d) => void (d.branding[key] = img))}
              />
            ))}
          </EditorSection>

          <EditorSection title="Hero" attention={sectionHasProblem("hero")} summary={content.hero.heading}>
            <TextField
              label="Main heading"
              max={120}
              value={content.hero.heading}
              error={problemFor("hero.heading")}
              onChange={(v) => update((d) => void (d.hero.heading = v))}
            />
            <TextAreaField
              label="Supporting text"
              max={400}
              rows={3}
              value={content.hero.text}
              onChange={(v) => update((d) => void (d.hero.text = v))}
            />
            <ImageField
              label="Hero image"
              image={content.hero.image}
              altError={problemFor("hero.image.alt")}
              onChange={(img) => update((d) => void (d.hero.image = img))}
            />
            {(["primary", "secondary"] as const).map((which) => (
              <fieldset key={which} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">
                  {which === "primary" ? "Main button" : "Second button"}
                </legend>
                <TextField
                  label="Label"
                  max={40}
                  value={content.hero[which].label}
                  error={problemFor(`hero.${which}`)}
                  onChange={(v) => update((d) => void (d.hero[which].label = v))}
                />
                <TextField
                  label="Link"
                  max={500}
                  type="url"
                  placeholder="https://… or mailto: or tel:"
                  value={content.hero[which].href}
                  error={problemFor(`hero.${which}.href`)}
                  onChange={(v) => update((d) => void (d.hero[which].href = v))}
                />
              </fieldset>
            ))}
          </EditorSection>

          <EditorSection title="About" summary={content.about.intro.slice(0, 60)}>
            <TextAreaField label="Introduction" max={1200} value={content.about.intro} onChange={(v) => update((d) => void (d.about.intro = v))} />
            <TextAreaField label="Mission" max={1200} rows={3} value={content.about.mission} onChange={(v) => update((d) => void (d.about.mission = v))} />
            <TextAreaField label="Wellness philosophy" max={1200} rows={3} value={content.about.philosophy} onChange={(v) => update((d) => void (d.about.philosophy = v))} />
          </EditorSection>

          <EditorSection title="Services" summary={`${content.services.filter((s) => s.enabled).length} shown`}>
            {SERVICE_KEYS.map((key) => {
              const entry = content.services.find((s) => s.key === key);
              return (
                <div key={key} className="rounded-xl border border-border p-3">
                  <Toggle
                    label={SERVICE_LABELS[key]}
                    checked={Boolean(entry?.enabled)}
                    onChange={(on) =>
                      update((d) => {
                        const found = d.services.find((s) => s.key === key);
                        if (found) found.enabled = on;
                        else d.services.push({ key, enabled: on, description: "" });
                      })
                    }
                  />
                  {entry?.enabled ? (
                    <TextAreaField
                      label="Description"
                      max={400}
                      rows={2}
                      value={entry.description}
                      onChange={(v) =>
                        update((d) => {
                          const found = d.services.find((s) => s.key === key);
                          if (found) found.description = v;
                        })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </EditorSection>

          <EditorSection title="Team" attention={sectionHasProblem("team")} summary={`${content.team.length} people`}>
            {content.team.map((m, i) => (
              <fieldset key={i} className="space-y-3 rounded-xl border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">Person {i + 1}</legend>
                <TextField label="Name" max={80} value={m.name} error={problemFor(`team.${i}.name`)} onChange={(v) => update((d) => void (d.team[i].name = v))} />
                <TextField label="Role" max={80} value={m.role} onChange={(v) => update((d) => void (d.team[i].role = v))} />
                <TextField label="Qualifications" max={300} value={m.qualifications} onChange={(v) => update((d) => void (d.team[i].qualifications = v))} />
                <TextField label="Specialisations" max={300} value={m.specialisations} onChange={(v) => update((d) => void (d.team[i].specialisations = v))} />
                <ImageField
                  label="Photo"
                  image={m.photo}
                  altError={problemFor(`team.${i}.photo.alt`)}
                  onChange={(img) => update((d) => void (d.team[i].photo = img))}
                />
                <Button type="button" size="xs" variant="ghost" onClick={() => update((d) => void d.team.splice(i, 1))}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              </fieldset>
            ))}
            {content.team.length < 24 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  update((d) =>
                    void d.team.push({ name: "", role: "", qualifications: "", specialisations: "", photo: { assetId: null, url: null, alt: "" } }),
                  )
                }
              >
                <Plus aria-hidden /> Add person
              </Button>
            ) : null}
          </EditorSection>

          <EditorSection title="Programmes" attention={sectionHasProblem("offerings")} summary={`${content.offerings.length} listed`}>
            <Toggle label="Show prices" checked={content.pricingEnabled} onChange={(on) => update((d) => void (d.pricingEnabled = on))} />
            {content.offerings.map((o, i) => (
              <fieldset key={i} className="space-y-3 rounded-xl border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-muted-foreground">Programme {i + 1}</legend>
                <TextField label="Name" max={80} value={o.name} error={problemFor(`offerings.${i}.name`)} onChange={(v) => update((d) => void (d.offerings[i].name = v))} />
                <TextAreaField label="Description" max={400} rows={2} value={o.description} onChange={(v) => update((d) => void (d.offerings[i].description = v))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Duration" max={60} placeholder="e.g. 8 weeks" value={o.duration} onChange={(v) => update((d) => void (d.offerings[i].duration = v))} />
                  {content.pricingEnabled ? (
                    <TextField label="Price" max={40} value={o.price} onChange={(v) => update((d) => void (d.offerings[i].price = v))} />
                  ) : null}
                </div>
                <Button type="button" size="xs" variant="ghost" onClick={() => update((d) => void d.offerings.splice(i, 1))}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              </fieldset>
            ))}
            {content.offerings.length < 24 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => update((d) => void d.offerings.push({ name: "", description: "", duration: "", price: "" }))}
              >
                <Plus aria-hidden /> Add programme
              </Button>
            ) : null}
          </EditorSection>

          <EditorSection title="Contact & social" attention={sectionHasProblem("contact") || sectionHasProblem("social")}>
            {problemFor("contact") ? <p className="text-xs font-medium text-destructive">{problemFor("contact")}</p> : null}
            <TextField label="Phone" type="tel" max={30} value={content.contact.phone} error={problemFor("contact.phone")} onChange={(v) => update((d) => void (d.contact.phone = v))} />
            <TextField label="Email" type="email" max={200} value={content.contact.email} error={problemFor("contact.email")} onChange={(v) => update((d) => void (d.contact.email = v))} />
            <TextAreaField label="Address" max={300} rows={2} value={content.contact.address} onChange={(v) => update((d) => void (d.contact.address = v))} />
            <TextField label="Google Maps link" type="url" max={500} placeholder="https://maps.app.goo.gl/…" value={content.contact.mapsUrl} error={problemFor("contact.mapsUrl")} onChange={(v) => update((d) => void (d.contact.mapsUrl = v))} />
            {(Object.keys(content.social) as Array<keyof WebsiteContent["social"]>).map((k) => (
              <TextField
                key={k}
                label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)}
                type="url"
                max={500}
                placeholder="https://…"
                value={content.social[k]}
                error={problemFor(`social.${k}`)}
                onChange={(v) => update((d) => void (d.social[k] = v))}
              />
            ))}
          </EditorSection>

          <EditorSection title="Footer & search engines">
            <TextAreaField label="Footer text" max={300} rows={2} value={content.footer.text} onChange={(v) => update((d) => void (d.footer.text = v))} />
            <TextField label="Page title (search results)" max={70} value={content.seo.title} onChange={(v) => update((d) => void (d.seo.title = v))} />
            <TextAreaField label="Description (search results)" max={160} rows={2} value={content.seo.description} onChange={(v) => update((d) => void (d.seo.description = v))} />
          </EditorSection>

          <EditorSection title="Section order" summary="Show, hide and reorder">
            <ol className="space-y-2">
              {content.sections.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-1">
                  <Toggle
                    label={SECTION_LABEL[s.id]}
                    checked={s.visible}
                    onChange={(on) => update((d) => void (d.sections[i].visible = on))}
                  />
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${SECTION_LABEL[s.id]} up`}
                      disabled={i === 0}
                      onClick={() => update((d) => void d.sections.splice(i - 1, 2, d.sections[i], d.sections[i - 1]))}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${SECTION_LABEL[s.id]} down`}
                      disabled={i === SECTION_IDS.length - 1}
                      onClick={() => update((d) => void d.sections.splice(i, 2, d.sections[i + 1], d.sections[i]))}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          </EditorSection>

          <EditorSection title="Published versions" summary={`${versions.length} kept`}>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {new Date(v.publishedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      <span className="block text-xs text-muted-foreground">
                        {TEMPLATES.find((t) => t.key === v.templateKey)?.name ?? v.templateKey}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm("Load this version into your draft? Your current draft is replaced; the live site is not changed.")) {
                          run(
                            () => restoreVersionAction(v.id),
                            (r) => r.ok && window.location.reload(),
                          );
                        }
                      }}
                    >
                      <RotateCcw aria-hidden /> Restore to draft
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </EditorSection>
        </div>

        {/* ── preview column (desktop) ───────────────────────────────── */}
        <div className="hidden xl:block">
          <div className="sticky top-[calc(var(--shell-header)+1rem)]">{preview}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * A real viewport of `width` CSS pixels, scaled to fit its column. Real width matters:
 * templates use media queries, which respond to the iframe's own width, not its scale.
 */
function PreviewFrame({ src, width, reloadKey }: { src: string; width: number; reloadKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  const height = 720;
  return (
    <div ref={box} className="mt-3 w-full overflow-hidden rounded-xl border border-border bg-muted/40" style={{ height: height * scale }}>
      <iframe
        key={`${src}-${reloadKey}`}
        src={src}
        title="Website preview"
        className="origin-top-left border-0 bg-white"
        style={{ width, height, transform: `scale(${scale})` }}
      />
    </div>
  );
}

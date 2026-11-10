import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { RenderSite } from "@/components/website/templates";
import { findLiveSiteBySlug } from "@/server/repositories/websites";

/**
 * A tenant's public website (WEBSITE-BUILDER-PRD FR-WEB-013/014).
 *
 * Serves the PUBLISHED snapshot only. `findLiveSiteBySlug` selects published columns of
 * live sites of ACTIVE organisations, so a draft, an unpublished site, a suspended tenant
 * and a slug that does not exist are all the same 404 — nothing about which was the case
 * is disclosed.
 *
 * The slug selects which public page to show; it grants nothing. Sign In carries it only
 * as a HINT, and membership is decided after Clerk verifies identity (ADR-012).
 */

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// One query per request even though metadata and page both need the site.
const loadSite = cache(async (slug: string) => (SLUG.test(slug) ? findLiveSiteBySlug(slug) : null));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const site = await loadSite((await params).slug);
  if (!site) return { title: "Not found" };
  const { seo, branding } = site.content;
  return {
    title: { absolute: seo.title || branding.businessName },
    description: seo.description || branding.tagline || undefined,
    // The app is noindex by default (it is private software). A published public site is
    // the one thing that is meant to be found.
    robots: { index: true, follow: true },
    ...(branding.favicon.url ? { icons: { icon: branding.favicon.url } } : {}),
  };
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) notFound();

  return (
    <RenderSite
      content={site.content}
      templateKey={site.templateKey}
      signInHref={`/sign-in?org=${encodeURIComponent(site.slug)}`}
      requestAccessHref="/request-access"
    />
  );
}

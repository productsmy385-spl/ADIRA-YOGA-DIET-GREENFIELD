import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RenderSite } from "@/components/website/templates";
import { requireRole } from "@/server/auth/guards";
import { loadWebsiteForEditing } from "@/server/services/website";
import { TEMPLATE_KEYS, type TemplateKey } from "@/server/website/templates";

export const metadata: Metadata = { title: "Website preview", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The editor's preview frame (FR-WEB-008): the caller's OWN draft, rendered by a template.
 *
 * Framed same-origin by `/admin/website` — the single route with that exception (see
 * next.config.ts). ADMIN and `canManageWebsite` are checked here, not inherited from the
 * page that frames it: anybody could open this URL directly.
 *
 * `?template=` lets the gallery show this organisation's content in any template. It is
 * accepted only from the fixed list, and affects only what this response renders.
 */
export default async function WebsitePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const loaded = await loadWebsiteForEditing(session);
  if (!loaded.ok) notFound();

  const requested = (await searchParams).template;
  const templateKey =
    requested && TEMPLATE_KEYS.includes(requested as TemplateKey)
      ? requested
      : loaded.value.website.templateKey;

  return (
    <RenderSite
      content={loaded.value.website.draft}
      templateKey={templateKey}
      // Inert inside the preview: following them would try to frame sign-in, which is
      // (correctly) refused.
      signInHref="#top"
      requestAccessHref="#top"
    />
  );
}

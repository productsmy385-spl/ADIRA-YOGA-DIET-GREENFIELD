import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/nav/app-nav";
import { PageShell } from "@/components/ui/page-shell";
import { requireRole } from "@/server/auth/guards";
import { homePathForRole } from "@/server/authorization/roles";
import { loadWebsiteForEditing } from "@/server/services/website";

import { WebsiteEditor } from "./website-editor";

export const metadata: Metadata = { title: "Website" };
export const dynamic = "force-dynamic";

/**
 * The organisation's public website — template, content, preview, publishing
 * (WEBSITE-BUILDER-PRD FR-WEB-001). Everything is scoped to the session's organisation by
 * the service; this page passes no identifiers to the client except the public slug.
 */
export default async function WebsitePage() {
  const session = await requireRole("ADMIN");
  const loaded = await loadWebsiteForEditing(session);
  if (!loaded.ok) redirect(homePathForRole(session.role));

  const { website, versions } = loaded.value;

  return (
    <div className="theme-bg-wrapper app-shell">
      <AppNav role={session.role} currentPath="/admin/website" />
      <PageShell width="wide">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Website</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your public site at{" "}
          <span className="font-medium text-foreground">/s/{session.organizationSlug}</span>. Edits
          save to a draft; nothing changes for visitors until you publish.
        </p>
        <div className="mt-6">
          <WebsiteEditor
            initialContent={website.draft}
            initialTemplate={website.templateKey}
            initialStatus={website.status}
            versions={versions}
            slug={session.organizationSlug}
          />
        </div>
      </PageShell>
    </div>
  );
}

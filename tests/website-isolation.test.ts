import { beforeEach, expect, it } from "vitest";

import { createOrganization, setOrganizationStatus } from "@/server/repositories/organizations";
import type { TenantSessionContext } from "@/server/repositories/sessions";
import { recordMediaAsset } from "@/server/repositories/media";
import { createUser } from "@/server/repositories/users";
import {
  VERSIONS_KEPT,
  findLiveSiteBySlug,
  getWebsite,
  listVersions,
} from "@/server/repositories/websites";
import {
  changeWebsiteTemplate,
  loadWebsiteForEditing,
  publishOrganizationWebsite,
  restoreWebsiteVersion,
  saveWebsiteDraft,
  unpublishOrganizationWebsite,
} from "@/server/services/website";
import { query } from "@/server/db/pool";

import { describeIsolated, resetDatabase } from "./helpers/sql-db";

/**
 * Website builder isolation and lifecycle (WEBSITE-BUILDER-PRD US-WEB-6, NFR-SEC-WEB-001/002).
 *
 * Runs only against the isolated test database (ADIRA_ISOLATED_TEST_DB=1), because it
 * resets every table. The service layer is exercised with real sessions shaped exactly as
 * `readTenantSession` returns them, so the permission and scoping path under test is the
 * one production uses.
 */

type Role = TenantSessionContext["role"];

async function sessionFor(orgId: string, orgName: string, role: Role, email: string) {
  const user = await createUser({
    organizationId: orgId,
    email,
    fullName: email.split("@")[0],
    role,
    status: "ACTIVE",
  });
  return {
    sessionId: "00000000-0000-0000-0000-000000000000",
    userId: user.id,
    organizationId: orgId,
    organizationName: orgName,
    role,
    email,
  } as unknown as TenantSessionContext;
}

describeIsolated("website builder — isolation and lifecycle", () => {
  let adminA: TenantSessionContext;
  let adminB: TenantSessionContext;
  let trainerA: TenantSessionContext;
  let orgB: string;

  const publishable = (name: string) => ({
    branding: { businessName: name },
    hero: { heading: `${name} welcomes you` },
    contact: { email: "hello@studio.example" },
  });

  beforeEach(async () => {
    await resetDatabase();
    const a = await createOrganization({ name: "Studio A", slug: "studio-a" });
    const b = await createOrganization({ name: "Studio B", slug: "studio-b" });
    orgB = b.id;
    adminA = await sessionFor(a.id, a.name, "ADMIN", "admin@a.example");
    adminB = await sessionFor(b.id, b.name, "ADMIN", "admin@b.example");
    trainerA = await sessionFor(a.id, a.name, "TRAINER", "trainer@a.example");
  });

  it("refuses TRAINER at the service layer, not just in the menu", async () => {
    expect(await loadWebsiteForEditing(trainerA)).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await publishOrganizationWebsite(trainerA)).toEqual({ ok: false, reason: "FORBIDDEN" });
    const denials = await query(
      `SELECT 1 FROM audit_logs WHERE action LIKE 'website.%' AND outcome = 'DENIED'`,
    );
    expect(denials.length).toBe(2);
  });

  it("scopes every write to the caller's own organisation", async () => {
    await loadWebsiteForEditing(adminA);
    await loadWebsiteForEditing(adminB);

    await saveWebsiteDraft(adminA, publishable("Studio A"));
    await publishOrganizationWebsite(adminA);

    // Admin B acting with everything it has can only ever reach its own row.
    await saveWebsiteDraft(adminB, publishable("Hijack"));
    const a = await findLiveSiteBySlug("studio-a");
    expect(a?.content.branding.businessName).toBe("Studio A");
  });

  it("cannot restore another organisation's version by id", async () => {
    await loadWebsiteForEditing(adminA);
    await loadWebsiteForEditing(adminB);
    await saveWebsiteDraft(adminB, publishable("Studio B"));
    await publishOrganizationWebsite(adminB);
    const [bVersion] = await listVersions(orgB);

    const result = await restoreWebsiteVersion(adminA, bVersion.id);
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
    const aSite = await getWebsite(adminA.organizationId);
    expect(aSite?.draft.branding.businessName).toBe("Studio A");
  });

  it("never serves a draft, an unpublished site, or a suspended organisation", async () => {
    await loadWebsiteForEditing(adminA);
    expect(await findLiveSiteBySlug("studio-a")).toBeNull(); // never published

    await saveWebsiteDraft(adminA, publishable("Studio A"));
    await publishOrganizationWebsite(adminA);
    await saveWebsiteDraft(adminA, { ...publishable("Studio A"), hero: { heading: "Unpublished draft" } });
    expect((await findLiveSiteBySlug("studio-a"))?.content.hero.heading).toBe("Studio A welcomes you");

    await unpublishOrganizationWebsite(adminA);
    expect(await findLiveSiteBySlug("studio-a")).toBeNull();

    await publishOrganizationWebsite(adminA);
    await setOrganizationStatus(adminA.organizationId, "SUSPENDED");
    expect(await findLiveSiteBySlug("studio-a")).toBeNull();
  });

  it("refuses to publish incomplete content and names the fields", async () => {
    await loadWebsiteForEditing(adminA);
    await saveWebsiteDraft(adminA, { branding: { businessName: "" }, hero: { heading: "" } });
    const result = await publishOrganizationWebsite(adminA);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "INVALID") {
      expect(result.problems.map((p) => p.field)).toEqual(
        expect.arrayContaining(["branding.businessName", "hero.heading", "contact"]),
      );
    }
    expect(await findLiveSiteBySlug("studio-a")).toBeNull();
  });

  it("keeps content when the template changes, and audits the change", async () => {
    await loadWebsiteForEditing(adminA);
    await saveWebsiteDraft(adminA, publishable("Studio A"));
    const changed = await changeWebsiteTemplate(adminA, "premium");
    expect(changed).toEqual({ ok: true, value: { previous: "minimal", next: "premium" } });

    const site = await getWebsite(adminA.organizationId);
    expect(site?.templateKey).toBe("premium");
    expect(site?.draft.branding.businessName).toBe("Studio A");

    const audit = await query<{ metadata: { from: string; to: string } }>(
      `SELECT metadata FROM audit_logs WHERE action = 'website.template_change'`,
    );
    expect(audit[0].metadata).toEqual({ from: "minimal", to: "premium" });
  });

  it("refuses an unknown template key", async () => {
    await loadWebsiteForEditing(adminA);
    const result = await changeWebsiteTemplate(adminA, "../../etc");
    expect(result.ok).toBe(false);
  });

  it("restores a version into the draft only, and prunes history", async () => {
    await loadWebsiteForEditing(adminA);
    await saveWebsiteDraft(adminA, publishable("First"));
    await publishOrganizationWebsite(adminA);
    const [first] = await listVersions(adminA.organizationId);

    await saveWebsiteDraft(adminA, publishable("Second"));
    await publishOrganizationWebsite(adminA);

    expect(await restoreWebsiteVersion(adminA, first.id)).toEqual({ ok: true, value: null });
    expect((await getWebsite(adminA.organizationId))?.draft.branding.businessName).toBe("First");
    // Live is untouched by a restore.
    expect((await findLiveSiteBySlug("studio-a"))?.content.branding.businessName).toBe("Second");

    for (let i = 0; i < VERSIONS_KEPT + 3; i += 1) await publishOrganizationWebsite(adminA);
    expect((await listVersions(adminA.organizationId)).length).toBe(VERSIONS_KEPT);
  });

  it("resolves only this organisation's own public website images", async () => {
    await loadWebsiteForEditing(adminA);
    const mk = (orgId: string, uploadedBy: string, purpose: "website" | "progress_photo", n: string) =>
      recordMediaAsset({
        organizationId: orgId,
        uploadedBy,
        purpose,
        fileId: `file-${n}`,
        url: `https://ik.imagekit.io/test/${n}.jpg`,
        mimeType: "image/jpeg",
        bytes: 1000,
      });
    const own = await mk(adminA.organizationId, adminA.userId, "website", "own");
    const foreign = await mk(orgB, adminB.userId, "website", "foreign");
    const privatePhoto = await mk(adminA.organizationId, adminA.userId, "progress_photo", "private");

    await saveWebsiteDraft(adminA, {
      ...publishable("Studio A"),
      hero: { heading: "x", image: { assetId: own.id, url: "https://evil.example/swap.png", alt: "Studio" } },
      branding: {
        businessName: "Studio A",
        logo: { assetId: foreign.id, url: null, alt: "x" },
        cover: { assetId: privatePhoto.id, url: null, alt: "x" },
      },
    });
    const draft = (await getWebsite(adminA.organizationId))!.draft;
    expect(draft.hero.image.url).toBe("https://ik.imagekit.io/test/own.jpg"); // DB url, not the client's
    expect(draft.branding.logo).toMatchObject({ assetId: null, url: null }); // other tenant
    expect(draft.branding.cover).toMatchObject({ assetId: null, url: null }); // private purpose
  });

  it("discards client-supplied image URLs (server owns them)", async () => {
    await loadWebsiteForEditing(adminA);
    await saveWebsiteDraft(adminA, {
      ...publishable("Studio A"),
      hero: { heading: "x", image: { assetId: null, url: "https://evil.example/x.png", alt: "x" } },
    });
    expect((await getWebsite(adminA.organizationId))?.draft.hero.image.url).toBeNull();
  });
});

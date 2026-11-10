import { describe, expect, it } from "vitest";

import { statusOf } from "@/server/repositories/websites";

import {
  SECTION_IDS,
  brandColorUsage,
  contrastRatio,
  defaultContent,
  isSafeLink,
  parseContent,
  publishProblems,
  websiteContentSchema,
} from "@/server/website/content";
import { TEMPLATES, TEMPLATE_KEYS } from "@/server/website/templates";

const valid = () => {
  const c = defaultContent("Sunrise Yoga");
  c.contact.email = "hello@sunrise.example";
  return c;
};

describe("content document", () => {
  // Zod 4's .default() skips parsing; .prefault() is what fills nested defaults. A
  // regression here silently produces documents with missing sections.
  it("fills every nested default from an empty object", () => {
    const c = websiteContentSchema.parse({});
    expect(c.branding.logo).toEqual({ assetId: null, url: null, alt: "" });
    expect(c.hero.primary).toEqual({ label: "", href: "" });
    expect(c.contact.email).toBe("");
    expect(c.sections.map((s) => s.id)).toEqual([...SECTION_IDS]);
  });

  it("starts a new organisation with its name filled in", () => {
    const c = defaultContent("Sunrise Yoga");
    expect(c.branding.businessName).toBe("Sunrise Yoga");
    expect(c.hero.heading).toBe("Sunrise Yoga");
  });

  it("keeps every section exactly once, in the stored order", () => {
    const c = websiteContentSchema.parse({
      sections: [
        { id: "contact", visible: false },
        { id: "hero" },
        { id: "contact", visible: true },
      ],
    });
    expect(c.sections[0]).toEqual({ id: "contact", visible: false });
    expect(c.sections[1].id).toBe("hero");
    expect(c.sections.filter((s) => s.id === "contact")).toHaveLength(1);
    expect(c.sections).toHaveLength(SECTION_IDS.length);
  });

  it("refuses over-long text and duplicate services with field paths", () => {
    const result = parseContent({
      branding: { businessName: "x".repeat(121) },
      services: [{ key: "yoga" }, { key: "yoga" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.problems.map((p) => p.field);
      expect(fields).toContain("branding.businessName");
      expect(fields).toContain("services");
    }
  });
});

describe("link safety (NFR-SEC-WEB-003)", () => {
  it.each(["https://instagram.com/sunrise", "mailto:hi@sunrise.example", "tel:+91 98765 43210", ""])(
    "accepts %s",
    (link) => expect(isSafeLink(link)).toBe(true),
  );

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://insecure.example",
    "//evil.example",
    "/admin",
    "https://localhost",
  ])("refuses %s", (link) => expect(isSafeLink(link)).toBe(false));

  it("rejects an unsafe link anywhere in the document", () => {
    const result = parseContent({ social: { instagram: "javascript:alert(1)" } });
    expect(result.ok).toBe(false);
  });
});

describe("publish rules (PRD §7)", () => {
  it("accepts a complete document", () => {
    expect(publishProblems(valid(), "minimal")).toEqual([]);
  });

  it("names each missing field", () => {
    const c = valid();
    c.branding.businessName = "";
    c.hero.heading = "";
    c.contact.email = "";
    const fields = publishProblems(c, "minimal").map((p) => p.field);
    expect(fields).toEqual(expect.arrayContaining(["branding.businessName", "hero.heading", "contact"]));
  });

  it("refuses an unknown template", () => {
    expect(publishProblems(valid(), "nope").map((p) => p.field)).toContain("template");
  });

  it("requires alt text on images that are set", () => {
    const c = valid();
    c.hero.image = { assetId: null, url: "https://ik.imagekit.io/x.jpg", alt: "" };
    expect(publishProblems(c, "minimal").map((p) => p.field)).toContain("hero.image.alt");
  });

  it("requires a button to have both a label and a link", () => {
    const c = valid();
    c.hero.primary = { label: "Book a class", href: "" };
    expect(publishProblems(c, "minimal").map((p) => p.field)).toContain("hero.primary");
  });
});

describe("brand colour (FR-WEB-005)", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#2AA704", "#ffffff")).toBeCloseTo(3.17, 1);
  });

  it("puts dark ink on a light brand colour and light ink on a dark one", () => {
    expect(brandColorUsage("#FFE066").foreground).toBe("dark");
    expect(brandColorUsage("#1B3A5C").foreground).toBe("light");
  });

  it("only allows the brand colour as text when it passes AA on white", () => {
    expect(brandColorUsage("#2AA704").usableAsText).toBe(false);
    expect(brandColorUsage("#1B3A5C").usableAsText).toBe(true);
  });
});

describe("templates", () => {
  it("has eight, each with a unique key and its own description", () => {
    expect(TEMPLATES).toHaveLength(8);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(8);
    expect(TEMPLATES.map((t) => t.key)).toEqual([...TEMPLATE_KEYS]);
    expect(new Set(TEMPLATES.map((t) => t.layout)).size).toBe(8);
  });
});

describe("status (FR-WEB-009)", () => {
  const base = {
    isLive: true,
    publishedAt: new Date(),
    templateKey: "minimal",
    publishedTemplateKey: "minimal",
    draft: { a: 1 },
    published: { a: 1 },
  };
  it("is DRAFT before the first publish", () => {
    expect(statusOf({ ...base, publishedAt: null })).toBe("DRAFT");
  });
  it("is PUBLISHED when draft equals live", () => {
    expect(statusOf(base)).toBe("PUBLISHED");
  });
  it("is CHANGES_PENDING when content or template differs", () => {
    expect(statusOf({ ...base, draft: { a: 2 } })).toBe("CHANGES_PENDING");
    expect(statusOf({ ...base, templateKey: "premium" })).toBe("CHANGES_PENDING");
  });
  it("is UNPUBLISHED when taken offline", () => {
    expect(statusOf({ ...base, isLive: false })).toBe("UNPUBLISHED");
  });
});

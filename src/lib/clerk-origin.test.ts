import { describe, expect, it } from "vitest";

import { clerkFrontendApiOrigin } from "./clerk-origin";

const key = (env: string, host: string) =>
  `pk_${env}_${Buffer.from(`${host}$`).toString("base64").replace(/=+$/, "")}`;

describe("clerkFrontendApiOrigin", () => {
  it("decodes a development instance host", () => {
    expect(clerkFrontendApiOrigin(key("test", "happy-otter-12.clerk.accounts.dev"))).toBe(
      "https://happy-otter-12.clerk.accounts.dev",
    );
  });

  it("decodes a production instance host", () => {
    expect(clerkFrontendApiOrigin(key("live", "clerk.adira.example"))).toBe(
      "https://clerk.adira.example",
    );
  });

  it("returns null for a missing or malformed key", () => {
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(clerkFrontendApiOrigin("pk_test")).toBeNull();
    expect(clerkFrontendApiOrigin("pk_test_not-a-real-key")).toBeNull();
  });

  // The decoded value is written into the CSP header. A key crafted to decode to
  // "host; script-src *" must not be able to add a directive.
  it("refuses a decoded host that would inject CSP syntax", () => {
    expect(clerkFrontendApiOrigin(key("live", "evil.example; script-src *"))).toBeNull();
    expect(clerkFrontendApiOrigin(key("live", "evil.example https://other.example"))).toBeNull();
  });
});

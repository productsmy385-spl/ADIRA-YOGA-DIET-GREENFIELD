import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Security headers applied to every response.
 *
 * These are defence in depth: they do not replace server-side authorization, they limit
 * the damage when something else goes wrong. Each one is here for a stated reason —
 * headers copied without a reason get deleted the first time they break something.
 */
const securityHeaders = [
  // Adira serves health data. It must never be framed by another origin, which is the
  // precondition for clickjacking a consultant into an action they did not intend.
  { key: "X-Frame-Options", value: "DENY" },

  // Stop the browser guessing a content type. Combined with the upload validation in
  // Phase 12, this is what keeps a "profile photo" from being served as script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Send the origin cross-site, the full path same-origin. Customer URLs will contain
  // identifiers; those should not leak to a third party in a Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Deny hardware access the product has no use for. Camera is deliberately NOT denied
  // outright — Phase 15's 3D yoga guide and progress photos may need it — but it is
  // restricted to same-origin.
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=(), camera=(self)",
  },

  // Two years, subdomains included. Set here so it is under review; Railway also
  // terminates TLS, but a header in the repo is a header someone can find.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Do not advertise the framework version. Minor, but free.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /*
   * NOT SET YET, deliberately — Content-Security-Policy.
   *
   * A real CSP needs a nonce threaded through the App Router's script tags, and it needs
   * to know which external origins the product actually uses (ImageKit in Phase 12, the
   * 3D asset host in Phase 15). Writing one now would mean either a policy so loose it
   * certifies nothing, or a strict one that breaks the moment Phase 12 lands and gets
   * loosened in a hurry. Phase 16 (security hardening) owns it, and docs/SECURITY.md
   * records that as an open item rather than letting it be forgotten.
   */
};

// No locale in the URL — the locale is negotiated per request from a cookie and
// Accept-Language. See decisions/ADR-010.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);

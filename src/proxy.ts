import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy (Phase 16).
 *
 * Deferred from Phase 0 deliberately — a CSP written before the app's external origins
 * were known would have been either so loose it certified nothing, or strict enough to
 * break the moment ImageKit landed and then loosened in a hurry. Now the origins are
 * known and the policy can be strict from the start.
 *
 * NOTE THE FILENAME. In Next 16 this is `proxy.ts`; `middleware.ts` is the older name.
 *
 * A NONCE, NOT 'unsafe-inline'.
 *
 * `'unsafe-inline'` on script-src defeats the point of having a CSP at all: it permits
 * exactly the injected inline script an XSS payload consists of. The nonce is fresh per
 * request and unguessable, so only scripts this server emitted can run — including the
 * theme script in `layout.tsx`, which reads it from the `x-nonce` header.
 *
 * `'strict-dynamic'` lets Next's own bootstrap load its chunks without every chunk URL
 * needing to be listed, which is what makes a nonce policy survive a framework upgrade.
 */

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // ImageKit is the only external origin the product loads from. Uploads go direct to
  // its API, and delivered images come from the CDN host.
  const imagekit = "https://ik.imagekit.io https://upload.imagekit.io";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: ${imagekit};
    font-src 'self' data:;
    connect-src 'self' ${imagekit};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  /*
   * style-src keeps 'unsafe-inline', and that is a considered trade-off rather than an
   * oversight. Next injects inline <style> for fonts and critical CSS, and nonce-ing
   * those is not reliable across framework versions. Inline STYLE is a far weaker
   * primitive than inline script — it cannot execute — so the residual risk is CSS-based
   * exfiltration of already-rendered content, not code execution. Revisit if Next gains
   * dependable style nonces.
   */

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  /*
   * Skip static assets and the image optimiser: they are not documents, cannot execute
   * script, and generating a nonce per asset request costs CPU for nothing.
   *
   * API routes are NOT skipped. They return JSON that no browser will execute, but the
   * cost is negligible and excluding paths from a security header is how one eventually
   * gets excluded by accident.
   */
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

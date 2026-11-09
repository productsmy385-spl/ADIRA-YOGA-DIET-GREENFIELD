import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { clerkFrontendApiOrigin } from "@/lib/clerk-origin";

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

function withSecurityHeaders(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  /*
   * THE 3D EXCEPTION — scoped to one route prefix, by the user's decision (ADR-014).
   *
   * glTF geometry and texture decoders are WebAssembly, and the KTX2 transcoder runs in a
   * worker created from a `blob:` URL. Neither is permitted by the policy below, so
   * without this branch 3D would fail in production while working locally.
   *
   * What is added is narrow and deliberate:
   *   wasm-unsafe-eval    permits WebAssembly COMPILATION. It does not permit eval() of
   *                       JavaScript — that is `unsafe-eval`, which is never added here.
   *   worker-src blob:    permits the decoder worker, same-origin decoders only.
   *
   * What is NOT weakened, here or anywhere: the nonce stays, 'strict-dynamic' stays,
   * frame-ancestors 'none' stays, object-src 'none' stays, and no 'unsafe-inline' is
   * ever added to script-src.
   *
   * The exception lives in this one expression so it cannot spread by accident. A future
   * route needing WASM must be added here, visibly, rather than by loosening the default.
   */
  const isImmersiveRoute = request.nextUrl.pathname.startsWith("/experience");
  const wasm = isImmersiveRoute ? " 'wasm-unsafe-eval'" : "";
  // Clerk's script runs its session timers in a `blob:` worker — scoped the same way, to
  // the pages that load Clerk at all (ADR-015).
  const isClerkRoute = /^\/(sign-in|sign-up|super-admin\/sign-in)(\/|$)/.test(
    request.nextUrl.pathname,
  );
  const workerSrc =
    isImmersiveRoute || isClerkRoute ? "worker-src 'self' blob:;" : "worker-src 'self';";

  // ImageKit is the only external origin the product loads from. Uploads go direct to
  // its API, and delivered images come from the CDN host.
  const imagekit = "https://ik.imagekit.io https://upload.imagekit.io";

  /*
   * Clerk (ADR-015), on the sign-in pages only in practice — but the policy is per
   * response, so the origins are listed for all. Each is the minimum Clerk documents:
   *   frontend API    its script, and the XHRs that carry the sign-in itself
   *   img.clerk.com   avatars and provider icons in the widget
   *   challenges.cloudflare.com   the bot-protection challenge (script + frame)
   * Its script still needs the nonce: 'strict-dynamic' ignores host allowlists in
   * script-src, so the hosts there only matter to browsers too old to know it.
   */
  const clerkApi = clerkFrontendApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ?? "";
  const turnstile = "https://challenges.cloudflare.com";

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${wasm}${isDev ? " 'unsafe-eval'" : ""} ${clerkApi} ${turnstile};
    ${workerSrc}
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: ${imagekit} https://img.clerk.com;
    font-src 'self' data:;
    connect-src 'self' ${imagekit} ${clerkApi};
    frame-src ${turnstile};
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

/**
 * Clerk's middleware wraps the CSP proxy. It establishes Clerk's request state so
 * `auth()` works in the sign-in pages and /auth/continue; it does NOT guard routes.
 * Authorization stays where it was — in the server components and actions, reading
 * Adira's own session from PostgreSQL (see guards.ts on why not middleware).
 */
export const proxy = clerkMiddleware((_auth, request) => withSecurityHeaders(request));

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
      source: "/((?!_next/static|_next/image|favicon.ico|icon.png|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

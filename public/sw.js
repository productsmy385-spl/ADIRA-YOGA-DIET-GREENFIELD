/* eslint-disable no-undef -- service worker globals */

/**
 * Adira service worker.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE: NOTHING AUTHENTICATED IS EVER CACHED.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A service worker's cache is shared by every session in that browser profile. Caching
 * an authenticated response means the next person to open the app on a shared phone —
 * a family tablet, a studio's front-desk device — can be served the previous user's
 * health data from disk, with no request and therefore no session check.
 *
 * That is not a theoretical risk for this product: `/today` shows one named person's
 * practice, `/admin` shows a caseload of health records, and a wellness studio is
 * exactly the kind of place with a shared device on the counter.
 *
 * So the allowlist below is BY PATH, not by response status, and it contains only
 * things that are identical for every visitor. Anything not on it is network-only:
 * no cache read, no cache write, no exceptions for "it was a 200".
 */

const VERSION = "adira-v1";
const SHELL_CACHE = `${VERSION}-shell`;

/**
 * Public, identical for everyone, safe on disk.
 *
 * `/offline` is a static page. The app shell is deliberately NOT precached: with the App
 * Router, HTML is per-route and often per-session, and precaching a rendered page is how
 * one user's dashboard ends up in another's cache.
 */
const PRECACHE = ["/offline", "/icon.svg", "/brand/mark.svg", "/manifest.webmanifest"];

/**
 * Paths that must never touch the cache, checked before anything else.
 *
 * A denylist *and* an allowlist, deliberately redundant: the allowlist is what actually
 * decides, and this exists so that a future change loosening the allowlist still cannot
 * reach authentication or API routes.
 */
const NEVER_CACHE = [/^\/api\//, /^\/sign-in/, /^\/today/, /^\/admin/, /^\/owner/, /^\/dashboard/];

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (NEVER_CACHE.some((p) => p.test(url.pathname))) return false;

  // Build output is content-hashed, so a stale entry is impossible by construction.
  if (url.pathname.startsWith("/_next/static/")) return true;

  return PRECACHE.includes(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one missing file does not fail the whole install and leave the
      // app with no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((path) => cache.add(path))))
      // Take over as soon as installed. The alternative is a user stuck on a worker from
      // three deploys ago until every tab closes.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A cached POST would be a replayed write.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /*
   * Navigations are network-first with an OFFLINE PAGE fallback — never a cached page.
   *
   * Serving a cached HTML document offline is the exact failure this worker exists to
   * prevent: it would show the last person's dashboard, rendered with their name and
   * their data, to whoever opens the app next.
   */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  if (!isCacheable(url)) return; // Network-only. The browser handles it as normal.

  // Cache-first for hashed static assets: the URL changes when the content does.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

/**
 * Let the page trigger an immediate update.
 *
 * Without this, a user who has been told "a new version is available" waits for every
 * tab to close before getting it.
 */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

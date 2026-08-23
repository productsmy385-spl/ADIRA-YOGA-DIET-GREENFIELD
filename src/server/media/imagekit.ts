import { createHmac, randomUUID } from "node:crypto";

import { env } from "@/lib/env";

/**
 * ImageKit upload authorisation (Phase 12).
 *
 * THE PRIVATE KEY NEVER LEAVES THE SERVER.
 *
 * The browser uploads directly to ImageKit — that is the point, since routing image
 * bytes through our own server would double the bandwidth and the latency for no gain.
 * What the browser receives is a SIGNATURE over a token and an expiry, not a credential.
 * The signature authorises exactly one upload, briefly, and is worthless afterwards.
 *
 * If `IMAGEKIT_PRIVATE_KEY` ever appears in a client component, an API response body, or
 * a NEXT_PUBLIC_ variable, that is a full compromise of the media account and not a
 * configuration slip.
 */

export interface UploadAuth {
  token: string;
  expire: number;
  signature: string;
}

/** Two minutes. Long enough for a slow connection, short enough to be worthless if leaked. */
const AUTH_TTL_SECONDS = 120;

export function isImageKitConfigured(): boolean {
  return Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT);
}

/**
 * Mint a short-lived upload authorisation.
 *
 * ImageKit's scheme: HMAC-SHA1 of `token + expire`, keyed by the private key. SHA-1 is
 * their specification, not our choice — it is a MAC with a secret key rather than a
 * collision-resistance claim, so its weaknesses do not apply here.
 */
export function createUploadAuth(): UploadAuth {
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "IMAGEKIT_PRIVATE_KEY is not configured. Media upload is unavailable until it is.",
    );
  }

  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS;
  const signature = createHmac("sha1", privateKey)
    .update(token + String(expire))
    .digest("hex");

  return { token, expire, signature };
}

/** What a caller may upload, and how large. */
export const UPLOAD_LIMITS = {
  /**
   * An allowlist, never a blocklist. A blocklist is a list of the formats we thought of;
   * SVG in particular is an image that can carry script, which is why it is absent.
   */
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"] as const,
  maxBytes: 8 * 1024 * 1024,
} as const;

export type AllowedMime = (typeof UPLOAD_LIMITS.mimeTypes)[number];

export function isAllowedMime(value: string): value is AllowedMime {
  return (UPLOAD_LIMITS.mimeTypes as readonly string[]).includes(value);
}

/**
 * Validate what the client CLAIMS it is uploading.
 *
 * This is a first gate, not the guarantee. A client can claim any MIME type it likes, so
 * the real check is what ImageKit reports back after the upload — which is what
 * `recordMediaAsset` stores. Checking here saves a pointless round trip and gives the
 * user an immediate, comprehensible error; it does not make the upload trustworthy.
 */
export function validateUploadRequest(input: {
  mimeType: string;
  bytes: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!isAllowedMime(input.mimeType)) {
    return { ok: false, reason: "That file type is not supported." };
  }
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) {
    return { ok: false, reason: "That file appears to be empty." };
  }
  if (input.bytes > UPLOAD_LIMITS.maxBytes) {
    return { ok: false, reason: "That file is larger than 8 MB." };
  }
  return { ok: true };
}

/**
 * A signed, expiring URL for a private asset.
 *
 * Progress photos are health data about an identifiable person and must not be
 * addressable by anyone holding the link. `media_assets.requires_signed_url` is decided
 * per asset rather than per folder, so one careless upload cannot make a whole category
 * public.
 */
export function signedUrlFor(path: string, ttlSeconds = 300): string {
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const endpoint = env.IMAGEKIT_URL_ENDPOINT;

  if (!privateKey || !endpoint) {
    throw new Error("ImageKit is not configured; cannot sign a media URL.");
  }

  const expire = Math.floor(Date.now() / 1000) + ttlSeconds;
  const url = new URL(path, endpoint);
  url.searchParams.set("ik-t", String(expire));

  const signature = createHmac("sha1", privateKey)
    .update(url.toString().replace(endpoint, "") + String(expire))
    .digest("hex");

  url.searchParams.set("ik-s", signature);
  return url.toString();
}

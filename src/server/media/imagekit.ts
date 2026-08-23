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
  return Boolean(
    env.IMAGEKIT_PUBLIC_KEY && env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT,
  );
}

/** The public key, for handing to the browser. Never the private one. */
export function imageKitPublicKey(): string {
  const key = env.IMAGEKIT_PUBLIC_KEY;
  if (!key) throw new Error("IMAGEKIT_PUBLIC_KEY is not configured.");
  return key;
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

/*
 * Upload limits and the claim check live in `@/lib/media-limits`, because a Client
 * Component needs them too and must not import this module — it reads `env`, which
 * throws in the browser by design. Re-exported here so server callers have one import.
 */
export {
  UPLOAD_LIMITS,
  isAllowedMime,
  validateUploadRequest,
  type AllowedMime,
} from "@/lib/media-limits";

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

/* ── verifying what was actually uploaded ──────────────────────────────── */

/** What ImageKit says about a stored file. The client's claims are not consulted. */
export interface UploadedFile {
  fileId: string;
  url: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

interface ImageKitFileResponse {
  fileId?: string;
  url?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  filePath?: string;
}

const FILE_API = "https://api.imagekit.io/v1/files";

/**
 * Ask ImageKit what it actually received.
 *
 * THIS IS THE POINT AT WHICH AN UPLOAD BECOMES TRUSTWORTHY.
 *
 * The browser uploads directly, so the only thing it can honestly tell us afterwards is a
 * file id — every other field it might report (URL, MIME type, size) is a claim from a
 * party we do not control. Someone could post a fabricated 200-byte "image/png" and have
 * it recorded as a progress photo, or point `url` at an arbitrary origin that a
 * consultant's browser would then load.
 *
 * So the server re-reads the file from ImageKit with the private key and records THAT.
 * `validateUploadRequest` runs before the upload for a fast, comprehensible error; this
 * runs after it, and it is the check that counts.
 *
 * Returns `null` when the id is unknown — which is the expected answer for a forged id,
 * not an exceptional one.
 */
export async function fetchUploadedFile(fileId: string): Promise<UploadedFile | null> {
  const privateKey = env.IMAGEKIT_PRIVATE_KEY;
  const endpoint = env.IMAGEKIT_URL_ENDPOINT;
  if (!privateKey || !endpoint) {
    throw new Error("ImageKit is not configured; cannot verify an upload.");
  }

  // ImageKit uses HTTP Basic with the private key as the username and an empty password.
  const authorization = `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;

  const response = await fetch(`${FILE_API}/${encodeURIComponent(fileId)}/details`, {
    method: "GET",
    headers: { Authorization: authorization },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    // Deliberately does not include the body: an upstream error body is attacker-
    // influenced and could carry the request headers back into our logs.
    throw new Error(`ImageKit file lookup failed with status ${response.status}.`);
  }

  const file = (await response.json()) as ImageKitFileResponse;
  if (!file.fileId || !file.url || !file.mime || typeof file.size !== "number") {
    return null;
  }

  /*
   * The URL must belong to OUR endpoint. ImageKit would not return anything else, but the
   * value is about to be stored and later rendered in a consultant's browser, and a
   * stored URL pointing somewhere unexpected is the difference between a bug and a
   * content-injection vector. Cheap to assert, so assert it.
   */
  if (!file.url.startsWith(endpoint)) return null;

  return {
    fileId: file.fileId,
    url: file.url,
    mimeType: file.mime,
    bytes: file.size,
    width: typeof file.width === "number" ? file.width : null,
    height: typeof file.height === "number" ? file.height : null,
  };
}

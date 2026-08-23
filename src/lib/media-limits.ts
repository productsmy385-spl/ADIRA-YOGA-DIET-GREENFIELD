/**
 * What may be uploaded — shared by the browser and the server.
 *
 * These live in `lib/` rather than beside the ImageKit client because a Client Component
 * needs them to reject a 40 MB file before it starts a pointless upload, and importing
 * `server/media/imagekit.ts` would drag `env.ts` — and its server-only guard — into the
 * browser bundle.
 *
 * The client check is a COURTESY, not a control. It exists so the user gets an instant,
 * comprehensible message instead of watching a progress bar fail. The enforcement is on
 * the server, twice: once against what the client claims, and once against what ImageKit
 * reports it actually stored.
 */

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

/** The `accept` attribute for a file input, derived so it cannot drift from the list. */
export const UPLOAD_ACCEPT = UPLOAD_LIMITS.mimeTypes.join(",");

/**
 * Validate what the caller CLAIMS it is uploading.
 *
 * Pure, so the same function runs in the browser for the immediate error and on the
 * server for the real one. Returns a message written for a person, not a code — there is
 * no third party consuming these strings.
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

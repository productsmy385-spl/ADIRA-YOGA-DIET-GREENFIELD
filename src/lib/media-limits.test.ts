import { describe, expect, it } from "vitest";

import {
  isAllowedMime,
  UPLOAD_ACCEPT,
  UPLOAD_LIMITS,
  validateUploadRequest,
} from "./media-limits";

describe("upload limits", () => {
  it("rejects SVG", () => {
    // The specific one worth naming: SVG is an image that can carry script, so an
    // allowlist that "obviously" includes images must still exclude it. A regression here
    // would be stored XSS delivered through a progress photo.
    expect(isAllowedMime("image/svg+xml")).toBe(false);
    expect(validateUploadRequest({ mimeType: "image/svg+xml", bytes: 1000 })).toEqual({
      ok: false,
      reason: "That file type is not supported.",
    });
  });

  it("rejects anything not on the allowlist", () => {
    for (const mime of ["application/pdf", "text/html", "image/gif", "", "image/jpeg "]) {
      expect(isAllowedMime(mime)).toBe(false);
    }
  });

  it("accepts the four supported formats", () => {
    for (const mime of UPLOAD_LIMITS.mimeTypes) {
      expect(validateUploadRequest({ mimeType: mime, bytes: 1024 })).toEqual({ ok: true });
    }
  });

  it("treats the size limit as inclusive at the boundary", () => {
    const { maxBytes } = UPLOAD_LIMITS;
    expect(validateUploadRequest({ mimeType: "image/png", bytes: maxBytes }).ok).toBe(true);
    expect(validateUploadRequest({ mimeType: "image/png", bytes: maxBytes + 1 }).ok).toBe(
      false,
    );
  });

  it("rejects empty and nonsensical sizes", () => {
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateUploadRequest({ mimeType: "image/png", bytes }).ok).toBe(false);
    }
  });

  it("derives the accept attribute from the allowlist", () => {
    // Guards against the file input drifting from the validator — the failure mode being
    // a picker that offers a format the server then refuses.
    expect(UPLOAD_ACCEPT.split(",")).toEqual([...UPLOAD_LIMITS.mimeTypes]);
  });
});

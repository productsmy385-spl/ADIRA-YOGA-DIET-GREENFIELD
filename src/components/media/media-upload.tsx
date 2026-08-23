"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { UPLOAD_ACCEPT, UPLOAD_LIMITS, validateUploadRequest } from "@/lib/media-limits";

/**
 * Direct-to-ImageKit upload (Phase 12).
 *
 * THREE STEPS, AND THE MIDDLE ONE DOES NOT TOUCH THIS SERVER.
 *
 *   1. POST /api/media/upload-auth   → a two-minute signature, and nothing secret
 *   2. POST to ImageKit              → the bytes, straight from the browser
 *   3. POST /api/media/record        → a file id; the server re-reads the file and stores
 *                                      what ImageKit reports, not what this code says
 *
 * Step 2 is why the flow exists in this shape: routing image bytes through the
 * application server would double the bandwidth and the latency on the mobile connection
 * a customer photographs their progress on, for no gain at all.
 *
 * NOTHING HERE IS A SECURITY CONTROL. The size and type check below is a courtesy that
 * turns a failed upload into an instant sentence. Every real decision — may this person
 * upload, about which member, and is the stored file what it claims — is made on the
 * server, twice.
 */

export type UploadPurpose = "exercise" | "meal" | "progress_photo" | "avatar";

export interface RecordedMedia {
  id: string;
  purpose: string;
  requiresSignedUrl: boolean;
  /** Null for private assets, which must be reached through a signed URL. */
  url: string | null;
}

export interface MediaUploadProps {
  purpose: UploadPurpose;
  /** Required for `progress_photo` and `avatar`; ignored for library media. */
  customerId?: string;
  label: string;
  /** Told what was recorded, so the surrounding page can refresh without a full reload. */
  onUploaded?: (media: RecordedMedia) => void;
  className?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "authorising" }
  | { kind: "uploading"; percent: number }
  | { kind: "recording" }
  | { kind: "done"; media: RecordedMedia }
  | { kind: "error"; message: string };

interface UploadAuthResponse {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  folder: string;
}

const IMAGEKIT_UPLOAD = "https://upload.imagekit.io/api/v1/files/upload";

/** Extract a server error message, falling back to something a person can act on. */
async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Upload with progress.
 *
 * `XMLHttpRequest` rather than `fetch`, deliberately: request upload progress still has no
 * standard `fetch` equivalent that works across the browsers this product supports, and a
 * photo upload over a slow mobile connection with no progress indication reads as a hang.
 */
function uploadToImageKit(
  file: File,
  auth: UploadAuthResponse,
  onProgress: (percent: number) => void,
): Promise<{ fileId: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("fileName", file.name);
  form.append("publicKey", auth.publicKey);
  form.append("signature", auth.signature);
  form.append("expire", String(auth.expire));
  form.append("token", auth.token);
  // Decided by the server from the session — never chosen here (ADR-004).
  form.append("folder", auth.folder);
  // ImageKit would otherwise reuse a name and silently overwrite another upload.
  form.append("useUniqueFileName", "true");

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", IMAGEKIT_UPLOAD);

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("The upload was rejected. Please try again."));
        return;
      }
      try {
        const body = JSON.parse(request.responseText) as { fileId?: string };
        if (!body.fileId) {
          reject(new Error("The upload finished but returned no file."));
          return;
        }
        // Only the id is carried forward. Everything else ImageKit returned here is a
        // claim from the browser's point of view, and the server re-reads it anyway.
        resolve({ fileId: body.fileId });
      } catch {
        reject(new Error("The upload finished but could not be read."));
      }
    });

    request.addEventListener("error", () =>
      reject(new Error("The upload could not reach the media service.")),
    );
    request.addEventListener("abort", () => reject(new Error("The upload was cancelled.")));

    request.send(form);
  });
}

export function MediaUpload({
  purpose,
  customerId,
  label,
  onUploaded,
  className,
}: MediaUploadProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const busy =
    phase.kind === "authorising" || phase.kind === "uploading" || phase.kind === "recording";

  async function handleFile(file: File) {
    const claim = validateUploadRequest({ mimeType: file.type, bytes: file.size });
    if (!claim.ok) {
      setPhase({ kind: "error", message: claim.reason });
      return;
    }

    try {
      setPhase({ kind: "authorising" });

      const authResponse = await fetch("/api/media/upload-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose,
          customerId: customerId ?? null,
          mimeType: file.type,
          bytes: file.size,
        }),
      });

      if (!authResponse.ok) {
        setPhase({
          kind: "error",
          message: await errorFrom(authResponse, "That upload was not authorised."),
        });
        return;
      }

      const auth = (await authResponse.json()) as UploadAuthResponse;

      setPhase({ kind: "uploading", percent: 0 });
      const { fileId } = await uploadToImageKit(file, auth, (percent) =>
        setPhase({ kind: "uploading", percent }),
      );

      setPhase({ kind: "recording" });
      const recordResponse = await fetch("/api/media/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId, purpose, customerId: customerId ?? null }),
      });

      if (!recordResponse.ok) {
        setPhase({
          kind: "error",
          message: await errorFrom(recordResponse, "The upload could not be saved."),
        });
        return;
      }

      const media = (await recordResponse.json()) as RecordedMedia;
      setPhase({ kind: "done", media });
      onUploaded?.(media);
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "The upload failed.",
      });
    } finally {
      // Clear the input so choosing the SAME file again still fires `change`. Without
      // this, a retry after a failure appears to do nothing at all.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={className}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>

      <input
        ref={input}
        id={inputId}
        type="file"
        accept={UPLOAD_ACCEPT}
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Uploading…" : "Choose a photo"}
        </Button>

        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP or HEIC, up to {Math.round(UPLOAD_LIMITS.maxBytes / 1024 / 1024)}{" "}
          MB
        </p>
      </div>

      {/*
        One live region for every phase. Screen readers announce progress and the outcome
        without the focus moving, which matters because the button that started the upload
        is the element the user is still on.
      */}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm">
        {phase.kind === "authorising" && (
          <span className="text-muted-foreground">Preparing the upload…</span>
        )}
        {phase.kind === "uploading" && (
          <span className="text-muted-foreground">Uploading — {phase.percent}%</span>
        )}
        {phase.kind === "recording" && (
          <span className="text-muted-foreground">Saving…</span>
        )}
        {phase.kind === "done" && <span className="text-foreground">Photo saved.</span>}
        {phase.kind === "error" && (
          <span className="text-destructive">{phase.message}</span>
        )}
      </p>

      {phase.kind === "uploading" && (
        <div
          role="progressbar"
          aria-valuenow={phase.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${phase.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

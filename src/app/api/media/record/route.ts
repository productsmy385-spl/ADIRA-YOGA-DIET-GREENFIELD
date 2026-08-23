import { NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchUploadedFile,
  isImageKitConfigured,
  validateUploadRequest,
} from "@/server/media/imagekit";
import { decideUpload, denialResponse } from "@/server/media/upload-policy";
import { readTenantSession } from "@/server/auth/session";
import { recordMediaAsset } from "@/server/repositories/media";
import { recordAudit } from "@/server/repositories/audit-logs";

/**
 * Record an upload that ImageKit has confirmed.
 *
 * THE CLIENT SUPPLIES A FILE ID AND NOTHING ELSE THAT IS BELIEVED.
 *
 * After a direct upload the browser holds ImageKit's response, and it would be convenient
 * to store what it reports. It is also unsafe: URL, MIME type and size would then be
 * attacker-controlled, so a forged body could record a 200-byte text file as a member's
 * progress photo, or store a `url` pointing at an origin of the caller's choosing that a
 * consultant's browser would later load. So the server re-reads the file from ImageKit
 * with the private key and stores that.
 *
 * The permission decision runs again too. An authorisation minted for one member must not
 * be usable to attach a file to a different one, and the only way to be sure is to ask
 * the same question at the moment the row is written.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileId: z.string().min(1).max(200),
  purpose: z.enum(["exercise", "meal", "progress_photo", "avatar"]),
  customerId: z.uuid().nullish(),
});

export async function POST(request: Request) {
  const session = await readTenantSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isImageKitConfigured()) {
    return NextResponse.json(
      { error: "Media upload is not configured for this deployment." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That request was not understood." },
      { status: 400 },
    );
  }

  const { fileId, purpose, customerId } = parsed.data;

  const decision = await decideUpload(session, purpose, customerId ?? null);
  if (!decision.allowed) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "media.record",
      outcome: "DENIED",
      metadata: { purpose, reason: decision.reason },
    });
    const denial = denialResponse(decision.reason);
    return NextResponse.json({ error: denial.error }, { status: denial.status });
  }

  const file = await fetchUploadedFile(fileId);
  if (!file) {
    return NextResponse.json({ error: "That upload was not found." }, { status: 404 });
  }

  /*
   * Re-check the type and size against what ImageKit ACTUALLY stored. The pre-upload check
   * saw only what the browser claimed; this sees the file. A caller who declared a 2 MB
   * JPEG and uploaded a 40 MB TIFF is caught here and nowhere else.
   */
  const real = validateUploadRequest({ mimeType: file.mimeType, bytes: file.bytes });
  if (!real.ok) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "media.record",
      outcome: "DENIED",
      metadata: { purpose, reason: "REJECTED_BY_SERVER", mimeType: file.mimeType },
    });
    return NextResponse.json({ error: real.reason }, { status: 400 });
  }

  const asset = await recordMediaAsset({
    organizationId: session.organizationId,
    uploadedBy: session.userId,
    customerId: decision.customerId,
    purpose,
    fileId: file.fileId,
    url: file.url,
    mimeType: file.mimeType,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
  });

  await recordAudit({
    organizationId: session.organizationId,
    actorDomain: "TENANT",
    actorId: session.userId,
    actorLabel: session.email,
    action: "media.record",
    outcome: "SUCCESS",
    metadata: { purpose, mediaId: asset.id },
  });

  /*
   * The stored URL is returned only for library media. A private asset (progress photo,
   * avatar) must be reached through a signed, expiring URL, and handing back the raw one
   * here would defeat `requires_signed_url` at the first call site that used it.
   */
  return NextResponse.json({
    id: asset.id,
    purpose: asset.purpose,
    requiresSignedUrl: asset.requiresSignedUrl,
    url: asset.requiresSignedUrl ? null : asset.url,
  });
}

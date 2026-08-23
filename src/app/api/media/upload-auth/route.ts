import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createUploadAuth,
  imageKitPublicKey,
  isImageKitConfigured,
  UPLOAD_LIMITS,
  validateUploadRequest,
} from "@/server/media/imagekit";
import { decideUpload, denialResponse } from "@/server/media/upload-policy";
import { readTenantSession } from "@/server/auth/session";
import { recordAudit } from "@/server/repositories/audit-logs";

/**
 * Mint a short-lived authorisation for one direct-to-ImageKit upload.
 *
 * The browser sends the bytes straight to ImageKit — routing them through this server
 * would double the bandwidth and the latency for nothing. What crosses this boundary is a
 * signature over a token and an expiry, valid for two minutes and worthless afterwards.
 * `IMAGEKIT_PRIVATE_KEY` never appears in the response.
 *
 * THE CHECK HERE IS NOT THE ONLY CHECK. An authorisation says "you may upload"; it does
 * not say what was uploaded or who it is about. `/api/media/record` re-runs the same
 * permission decision and re-reads the file from ImageKit before anything is stored.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  purpose: z.enum(["exercise", "meal", "progress_photo", "avatar"]),
  customerId: z.uuid().nullish(),
  mimeType: z.string().min(1),
  bytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await readTenantSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isImageKitConfigured()) {
    // A deployment without media configured should say so plainly rather than fail
    // during the upload with an opaque ImageKit error the user cannot act on.
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

  const { purpose, customerId, mimeType, bytes } = parsed.data;

  const claim = validateUploadRequest({ mimeType, bytes });
  if (!claim.ok) {
    return NextResponse.json({ error: claim.reason }, { status: 400 });
  }

  const decision = await decideUpload(session, purpose, customerId ?? null);
  if (!decision.allowed) {
    await recordAudit({
      organizationId: session.organizationId,
      actorDomain: "TENANT",
      actorId: session.userId,
      actorLabel: session.email,
      action: "media.upload_auth",
      outcome: "DENIED",
      metadata: { purpose, reason: decision.reason },
    });
    const denial = denialResponse(decision.reason);
    return NextResponse.json({ error: denial.error }, { status: denial.status });
  }

  const auth = createUploadAuth();

  return NextResponse.json({
    ...auth,
    publicKey: imageKitPublicKey(),
    /*
     * The folder is decided HERE, from the session, and is not accepted from the client.
     * A client-chosen folder would let one tenant write into another tenant's prefix,
     * which is ADR-004 at the storage layer — scope comes from the session, never from
     * the request.
     */
    folder: `/${session.organizationId}/${purpose}`,
    maxBytes: UPLOAD_LIMITS.maxBytes,
  });
}

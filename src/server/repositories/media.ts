import { query, queryOne } from "@/server/db/pool";

/**
 * Media metadata (Phase 12). The bytes live in ImageKit; this records what exists.
 *
 * `customer_id` is the SUBJECT, not the uploader. A progress photo is about a person,
 * and the composite foreign key means it cannot be attached to a customer in another
 * tenant. `uploaded_by` is nullable because an exercise illustration outlives the staff
 * member who added it.
 */

export type MediaPurpose = "exercise" | "meal" | "progress_photo" | "avatar";

/**
 * Which purposes hold data about an identifiable person.
 *
 * These default to signed access. Deciding it here rather than at each call site means a
 * new upload path cannot forget — the safe answer is the default, and making something
 * public is the deliberate act.
 */
const PRIVATE_PURPOSES: ReadonlySet<string> = new Set(["progress_photo", "avatar"]);

export interface MediaAsset {
  id: string;
  fileId: string;
  url: string;
  mimeType: string;
  bytes: number;
  purpose: string;
  customerId: string | null;
  requiresSignedUrl: boolean;
  createdAt: Date;
}

interface MediaRow {
  id: string;
  file_id: string;
  url: string;
  mime_type: string;
  bytes: string;
  purpose: string;
  customer_id: string | null;
  requires_signed_url: boolean;
  created_at: Date;
}

const COLUMNS = `
  id, file_id, url, mime_type, bytes::text AS bytes, purpose,
  customer_id, requires_signed_url, created_at
`;

function toAsset(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    fileId: row.file_id,
    url: row.url,
    mimeType: row.mime_type,
    bytes: Number(row.bytes),
    purpose: row.purpose,
    customerId: row.customer_id,
    requiresSignedUrl: row.requires_signed_url,
    createdAt: row.created_at,
  };
}

export interface RecordMediaInput {
  organizationId: string;
  uploadedBy: string | null;
  customerId?: string | null;
  purpose: MediaPurpose;
  /** Reported by ImageKit AFTER the upload — not by the client before it. */
  fileId: string;
  url: string;
  mimeType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
}

/**
 * Record an upload that ImageKit has confirmed.
 *
 * The values here come from ImageKit's response, not from the browser's claim. The
 * client's stated MIME type and size were checked before the upload to give a fast
 * error; this is what the storage provider actually received, and it is what the
 * database keeps.
 */
export async function recordMediaAsset(input: RecordMediaInput): Promise<MediaAsset> {
  const row = await queryOne<MediaRow>(
    `INSERT INTO media_assets
       (organization_id, uploaded_by, customer_id, purpose, file_id, url,
        mime_type, bytes, width, height, requires_signed_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLUMNS}`,
    [
      input.organizationId,
      input.uploadedBy,
      input.customerId ?? null,
      input.purpose,
      input.fileId,
      input.url,
      input.mimeType,
      input.bytes,
      input.width ?? null,
      input.height ?? null,
      PRIVATE_PURPOSES.has(input.purpose),
    ],
  );
  return toAsset(row!);
}

export async function findMediaAsset(
  organizationId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  const row = await queryOne<MediaRow>(
    `SELECT ${COLUMNS} FROM media_assets WHERE id = $2 AND organization_id = $1`,
    [organizationId, assetId],
  );
  return row ? toAsset(row) : null;
}

/** A customer's own media — progress photos. Scoped by both organisation and subject. */
export async function listCustomerMedia(
  organizationId: string,
  customerId: string,
): Promise<MediaAsset[]> {
  const rows = await query<MediaRow>(
    `SELECT ${COLUMNS} FROM media_assets
      WHERE organization_id = $1 AND customer_id = $2
      ORDER BY created_at DESC`,
    [organizationId, customerId],
  );
  return rows.map(toAsset);
}

export async function listLibraryMedia(
  organizationId: string,
  purpose: MediaPurpose,
): Promise<MediaAsset[]> {
  const rows = await query<MediaRow>(
    `SELECT ${COLUMNS} FROM media_assets
      WHERE organization_id = $1 AND purpose = $2 AND customer_id IS NULL
      ORDER BY created_at DESC`,
    [organizationId, purpose],
  );
  return rows.map(toAsset);
}

/**
 * Delete an asset's record.
 *
 * Returns the ImageKit file id so the caller can remove the bytes too. Deleting the row
 * without the file leaves an orphan in ImageKit that nobody will ever find — which for a
 * progress photo means health data persisting after someone asked for it to be gone.
 */
export async function deleteMediaAsset(
  organizationId: string,
  assetId: string,
): Promise<string | null> {
  const row = await queryOne<{ file_id: string }>(
    `DELETE FROM media_assets
      WHERE id = $2 AND organization_id = $1
      RETURNING file_id`,
    [organizationId, assetId],
  );
  return row?.file_id ?? null;
}

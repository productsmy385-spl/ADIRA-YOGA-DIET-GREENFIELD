/**
 * Reading a CSV upload, with a bound.
 *
 * The body is read as TEXT and parsed by our own parser, never handed to a spreadsheet
 * library. Both import endpoints share this so the limit cannot be enforced on the
 * preview and forgotten on the write — which is the version of this bug that matters,
 * because the preview is the harmless one.
 */

/**
 * Two megabytes.
 *
 * A 300-row roster is a few tens of kilobytes; this leaves room for a file with long
 * names and a UTF-8 BOM while refusing anything that is not a member list. The check is
 * on BYTES, before decoding, because a multi-megabyte body should never be turned into a
 * JavaScript string at all — reading it first is the memory-exhaustion the limit exists
 * to prevent.
 */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

export type CsvBody =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

export async function readCsvBody(request: Request): Promise<CsvBody> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_CSV_BYTES) {
    return { ok: false, status: 413, error: "That file is larger than 2 MB." };
  }

  const buffer = await request.arrayBuffer();

  // Re-checked after reading: `content-length` is a claim, and a chunked request has none
  // at all, so trusting the header alone would leave the limit unenforced exactly when it
  // is being evaded.
  if (buffer.byteLength > MAX_CSV_BYTES) {
    return { ok: false, status: 413, error: "That file is larger than 2 MB." };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, status: 400, error: "That file is empty." };
  }

  // `fatal: true` rejects invalid UTF-8 rather than substituting replacement characters,
  // so a mis-encoded export fails with a message instead of importing names full of "".
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { ok: true, text };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "That file is not UTF-8 text. Re-export it as CSV UTF-8.",
    };
  }
}

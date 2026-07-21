/**
 * PROJ-79-α — DMS upload MIME allowlist + magic-byte sniffing.
 *
 * The upload route MUST NOT trust the browser-declared `Content-Type`:
 * a spoofed extension/declared type is a classic upload attack. We sniff
 * the *real* type from magic bytes via `file-type` (same lib the PROJ-70
 * parser uses) for binary formats, and trust the extension for the three
 * text formats that have no magic signature.
 *
 * α allowlist == RAG-supported set (9 formats). Everything else is a hard
 * 415. `mime_unsupported_for_rag` therefore always defaults `false` in α;
 * the flag exists for PROJ-80 (β) when the allowlist widens beyond the
 * RAG-parseable set.
 *
 * AC (mirror PROJ-70 γ-hardening): magic-byte sniff before any persistence,
 * dynamic `import` of the ESM-only `file-type` lib to keep cold-start small.
 */

/** The 9 α-allowlisted MIME types (== RAG-supported set). */
export const DMS_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "text/plain", // txt
  "text/markdown", // md
  "text/csv", // csv
  "image/png",
  "image/jpeg", // jpg / jpeg
] as const

export type DmsAllowedMime = (typeof DMS_ALLOWED_MIME_TYPES)[number]

const ALLOWED = new Set<string>(DMS_ALLOWED_MIME_TYPES)

/** Extensions handled purely by trusting the client (no magic signature). */
const TEXT_EXT_TO_MIME: Record<string, DmsAllowedMime> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
}

/**
 * Expected MIME per binary extension, used for anti-spoof cross-checks: a
 * `.pdf` that sniffs as `image/png` (or vice-versa) is rejected even though
 * both are individually allowlisted.
 */
const BINARY_EXT_TO_MIME: Record<string, DmsAllowedMime> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
}

export class DmsMimeError extends Error {
  readonly code: "magic_byte_mismatch" | "unsupported_mime"
  constructor(code: DmsMimeError["code"], message: string) {
    super(message)
    this.code = code
    this.name = "DmsMimeError"
  }
}

function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".")
  if (idx < 0 || idx === filename.length - 1) return ""
  return filename.slice(idx + 1).toLowerCase()
}

export interface SniffResult {
  mime: DmsAllowedMime
  /** false in α (allowlist == RAG-supported); reserved for PROJ-80. */
  mime_unsupported_for_rag: boolean
}

/**
 * Determine the real, allowlisted MIME for an uploaded buffer.
 *
 * - Text formats (txt/md/csv): trusted by extension (no magic bytes).
 * - Binary formats: sniffed via `file-type`; must be allowlisted AND, when
 *   the extension implies a specific binary type, must match it (anti-spoof).
 *
 * Throws `DmsMimeError`:
 *   - `unsupported_mime`  → format not in the α allowlist
 *   - `magic_byte_mismatch` → unsniffable buffer OR sniff ≠ declared extension
 */
export async function sniffDocumentMime(
  buffer: Buffer,
  filename: string,
): Promise<SniffResult> {
  const ext = extOf(filename)

  // Text formats have no magic signature — trust the extension.
  const textMime = TEXT_EXT_TO_MIME[ext]
  if (textMime) {
    return { mime: textMime, mime_unsupported_for_rag: false }
  }

  // Binary formats — sniff the real type. Dynamic import: file-type is
  // ESM-only (v17+) and would break the CJS test context on static import.
  const { fileTypeFromBuffer } = await import("file-type")
  // Pass the FULL buffer: OOXML (docx/xlsx/pptx) are ZIP containers whose
  // subtype detection needs the archive structure — a 4 KB head slice often
  // yields only `application/zip`/undefined and would wrongly 415 a valid
  // docx. `file-type` reads the buffer lazily, so this stays cheap.
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected) {
    throw new DmsMimeError(
      "magic_byte_mismatch",
      "Could not detect a supported file type from the uploaded bytes.",
    )
  }
  if (!ALLOWED.has(detected.mime)) {
    throw new DmsMimeError(
      "unsupported_mime",
      `Detected type ${detected.mime} is not an allowed document format.`,
    )
  }
  // Anti-spoof: extension must agree with the sniffed binary type.
  const expected = BINARY_EXT_TO_MIME[ext]
  if (expected && expected !== detected.mime) {
    throw new DmsMimeError(
      "magic_byte_mismatch",
      `File extension .${ext} does not match detected type ${detected.mime}.`,
    )
  }
  return {
    mime: detected.mime as DmsAllowedMime,
    mime_unsupported_for_rag: false,
  }
}

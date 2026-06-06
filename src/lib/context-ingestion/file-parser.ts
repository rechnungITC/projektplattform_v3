/**
 * PROJ-70-γ — File-parser for kickoff context sources.
 *
 * Three entry-points + helpers, all server-side:
 *   - sniffMagic(buffer)  → AC-γH-5 (magic-byte detection via file-type)
 *   - parsePdf(buffer)    → AC-γH-2 (page cap 200) + Promise.race timeout
 *                           wrap delegated to caller via parseFile
 *   - parseDocx(buffer)   → AC-γH-3 (raw text 2 MB cap, anti-zip-bomb)
 *   - parseFile(buffer, mime) → orchestrator with AC-γH-4 (20s timeout)
 *
 * Libraries (CIA-approved 2026-06-04):
 *   - pdfjs-dist (direct, Mozilla, MIT) — replaces unmaintained pdf-parse
 *   - mammoth (BSD-2) — DOCX → plaintext
 *   - file-type (MIT, ESM-only >=17) — magic-byte sniffing via dynamic import
 *
 * PROJ-70-δ adds two email branches (CIA-approved 2026-06-06):
 *   - mailparser (MIT, Nodemailer) — `.eml` via ./eml-parser
 *   - @kenjiuno/msgreader (Apache-2.0) — `.msg` via ./msg-parser
 * Both are dispatched through dynamic imports of the sibling modules so
 * this file stays cycle-free at module-load time.
 *
 * AC-γH-8 (lazy/dynamic import): all libs are loaded via `await import`
 * inside the entry-point functions so cold-start of routes that don't parse
 * isn't penalised + ESM-only `file-type` doesn't break in CJS test contexts.
 */

import type { EmailMetadata } from "./eml-parser"

const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "message/rfc822",
  "application/vnd.ms-outlook",
])

const MAX_FILE_BYTES = 26_214_400 // 25 MB — AC-γH-1
const MAX_PDF_PAGES = 200 // AC-γH-2
const MAX_PLAINTEXT_RAW_BYTES = 2 * 1024 * 1024 // 2 MB raw text — AC-γH-3
const EXCERPT_MAX_CHARS = 8_000 // PROJ-44-β content_excerpt cap
const PARSE_TIMEOUT_MS = 20_000 // AC-γH-4

export type SupportedMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown"
  | "message/rfc822"
  | "application/vnd.ms-outlook"

export interface ParseResult {
  /** Plaintext excerpt capped at EXCERPT_MAX_CHARS for storage in
   *  `context_sources.content_excerpt`. */
  excerpt: string
  /** Raw-text length BEFORE the excerpt cut, useful for "truncated to N chars"
   *  UX hints. */
  raw_length: number
  /** Number of pages extracted from a PDF; 1 for non-paginated formats. */
  page_count: number
  /** True when this run was source-truncated by AC-γH-2/H-3 caps. */
  truncated: boolean
  /** PROJ-70-δ — email header extraction; present only for .eml/.msg
   *  uploads. Persisted into `context_sources.source_metadata` (Lock-5). */
  email?: EmailMetadata
}

export class FileParseError extends Error {
  readonly code:
    | "size_exceeded"
    | "page_limit_exceeded"
    | "raw_text_cap_exceeded"
    | "magic_byte_mismatch"
    | "unsupported_mime"
    | "parse_timeout"
    | "parse_failed"
    | "email_too_many_parts" // PROJ-70-δ AC-δH-2 — multipart bomb
    | "msg_parse_failed" // PROJ-70-δ AC-δH-4 — malformed CFB

  constructor(
    code: FileParseError["code"],
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = "FileParseError"
  }
}

/**
 * AC-γH-5 — Magic-byte detection. Inspects the first ~4 KB of the buffer
 * via the `file-type` lib (dynamic import; ESM-only since v17).
 *
 * Returns the detected MIME, OR throws when:
 *   * the buffer is too short to sniff
 *   * the detected MIME is not in our allowlist
 *   * the lib returns undefined (unknown format)
 *
 * For `text/plain`, `text/markdown` and `message/rfc822` we accept the
 * caller's MIME hint directly since these text formats have no magic-byte
 * signature — content is verified downstream (`parseText` UTF-8 check,
 * `parseEml` RFC822 parse).
 *
 * PROJ-70-δ: Outlook `.msg` is a Compound File Binary (D0 CF 11 E0);
 * `file-type` reports that container as `application/x-cfb`, which we
 * map to `application/vnd.ms-outlook`. Non-Outlook CFB files (legacy
 * .doc/.xls) pass the sniff but fail in parseMsg with
 * `msg_parse_failed` (AC-δH-4) — acceptable, documented.
 */
export async function sniffMagic(
  buffer: Buffer,
  callerMimeHint: string,
): Promise<SupportedMime> {
  // Plain-text formats have no magic header; trust the caller's MIME hint
  // and verify content in parseText / parseEml.
  if (
    callerMimeHint === "text/plain" ||
    callerMimeHint === "text/markdown" ||
    callerMimeHint === "message/rfc822"
  ) {
    if (!ALLOWED_MIME_TYPES.has(callerMimeHint)) {
      throw new FileParseError(
        "unsupported_mime",
        `MIME type ${callerMimeHint} is not allowed.`,
      )
    }
    return callerMimeHint as SupportedMime
  }

  if (buffer.length < 4) {
    throw new FileParseError(
      "magic_byte_mismatch",
      "Buffer too short to detect file type.",
    )
  }

  // AC-γH-8 — dynamic import keeps cold-start small + bypasses ESM/CJS friction.
  const { fileTypeFromBuffer } = await import("file-type")
  // file-type only reads the first 4100 bytes; pass the slice for clarity.
  const detected = await fileTypeFromBuffer(buffer.subarray(0, 4_100))
  if (!detected) {
    throw new FileParseError(
      "magic_byte_mismatch",
      "Could not detect file type from magic bytes.",
    )
  }
  // PROJ-70-δ — CFB container → Outlook MSG candidate (validated by
  // parseMsg's dataType check, AC-δH-4).
  if (detected.mime === "application/x-cfb") {
    return "application/vnd.ms-outlook"
  }
  if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new FileParseError(
      "unsupported_mime",
      `Detected MIME type ${detected.mime} is not allowed.`,
    )
  }
  return detected.mime as SupportedMime
}

/**
 * AC-γH-2 — Parse PDF via `pdfjs-dist` directly (CIA-approved substitute for
 * the unmaintained `pdf-parse` wrapper). Custom extract-loop gives us
 * control over page-cap, memory, and timeout.
 *
 * Throws `FileParseError(page_limit_exceeded)` when the document has more
 * than `MAX_PDF_PAGES` pages.
 */
export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `PDF exceeds the ${MAX_FILE_BYTES}-byte cap.`,
    )
  }

  // AC-γH-8 — dynamic import.
  // pdfjs-dist publishes ESM under /legacy/build/pdf.mjs; Node 20 + Next 16
  // App Router resolve this automatically when imported as `pdfjs-dist`.
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (opts: { data: Uint8Array; disableWorker?: boolean }) => {
      promise: Promise<{
        numPages: number
        getPage: (n: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str: string }> }>
        }>
      }>
    }
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  })
  const doc = await loadingTask.promise

  if (doc.numPages > MAX_PDF_PAGES) {
    throw new FileParseError(
      "page_limit_exceeded",
      `PDF has ${doc.numPages} pages, max is ${MAX_PDF_PAGES}.`,
    )
  }

  const chunks: string[] = []
  let rawLength = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    const text = tc.items.map((it) => it.str).join(" ")
    chunks.push(text)
    rawLength += text.length
    if (rawLength > MAX_PLAINTEXT_RAW_BYTES) {
      // Defensive: a 200-page text-bomb is unlikely but possible.
      break
    }
  }
  const raw = chunks.join("\n\n")
  const excerpt = raw.length > EXCERPT_MAX_CHARS ? raw.slice(0, EXCERPT_MAX_CHARS) : raw

  return {
    excerpt,
    raw_length: rawLength,
    page_count: doc.numPages,
    truncated: rawLength > EXCERPT_MAX_CHARS || rawLength >= MAX_PLAINTEXT_RAW_BYTES,
  }
}

/**
 * AC-γH-3 — Parse DOCX via `mammoth`. Caps the raw-text output at
 * 2 MB BEFORE the 8000-char excerpt cut. Mammoth's underlying `jszip`
 * decoder can in theory amplify a small ZIP into a large text payload
 * (decompression-bomb); the cap is the second line of defense after the
 * file-size limit.
 */
export async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `DOCX exceeds the ${MAX_FILE_BYTES}-byte cap.`,
    )
  }

  // AC-γH-8 — dynamic import.
  const mammoth = (await import("mammoth")) as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
  }

  const result = await mammoth.extractRawText({ buffer })
  const raw = result.value ?? ""

  if (Buffer.byteLength(raw, "utf8") > MAX_PLAINTEXT_RAW_BYTES) {
    throw new FileParseError(
      "raw_text_cap_exceeded",
      "DOCX raw-text exceeds the 2 MB cap (possible ZIP-bomb amplification).",
    )
  }

  const excerpt = raw.length > EXCERPT_MAX_CHARS ? raw.slice(0, EXCERPT_MAX_CHARS) : raw
  return {
    excerpt,
    raw_length: raw.length,
    page_count: 1, // DOCX has no native page count without rendering
    truncated: raw.length > EXCERPT_MAX_CHARS,
  }
}

/**
 * Parse plain-text / markdown. No external library; just UTF-8 decode +
 * trim. The raw-text cap still applies (anti-DoS).
 */
export function parseText(buffer: Buffer): ParseResult {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `Text file exceeds the ${MAX_FILE_BYTES}-byte cap.`,
    )
  }
  if (buffer.length > MAX_PLAINTEXT_RAW_BYTES) {
    throw new FileParseError(
      "raw_text_cap_exceeded",
      "Text raw-text exceeds the 2 MB cap.",
    )
  }
  const raw = buffer.toString("utf8")
  const excerpt = raw.length > EXCERPT_MAX_CHARS ? raw.slice(0, EXCERPT_MAX_CHARS) : raw
  return {
    excerpt,
    raw_length: raw.length,
    page_count: 1,
    truncated: raw.length > EXCERPT_MAX_CHARS,
  }
}

/**
 * AC-γH-4 — Orchestrator with Promise.race timeout.
 *
 * Wraps whichever parser fits the magic-validated MIME in a 20-second
 * timeout. Any parse-throw is wrapped in FileParseError(parse_failed)
 * unless it already is one (in which case it propagates unchanged so
 * the caller can map specific error codes).
 */
export async function parseFile(
  buffer: Buffer,
  callerMimeHint: string,
): Promise<{ result: ParseResult; mime: SupportedMime }> {
  // AC-γH-1 — size cap is also enforced upstream at the multipart handler,
  // but having it here defends against direct internal callers.
  if (buffer.length > MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `File exceeds the ${MAX_FILE_BYTES}-byte cap.`,
    )
  }

  // AC-γH-5 — magic-byte sniff before any parser dispatch.
  const mime = await sniffMagic(buffer, callerMimeHint)

  const parserPromise: Promise<ParseResult> = (async () => {
    switch (mime) {
      case "application/pdf":
        return parsePdf(buffer)
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return parseDocx(buffer)
      case "text/plain":
      case "text/markdown":
        return parseText(buffer)
      // PROJ-70-δ — email branches. Dynamic sibling-module imports keep
      // the module graph cycle-free (AC-δH-6 mirror of AC-γH-8).
      case "message/rfc822": {
        const { parseEml } = await import("./eml-parser")
        return parseEml(buffer)
      }
      case "application/vnd.ms-outlook": {
        const { parseMsg } = await import("./msg-parser")
        return parseMsg(buffer)
      }
    }
  })()

  // AC-γH-4 — Promise.race with hard 20s timeout.
  const timeoutPromise: Promise<never> = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new FileParseError(
            "parse_timeout",
            `Parsing exceeded ${PARSE_TIMEOUT_MS / 1000} s timeout.`,
          ),
        ),
      PARSE_TIMEOUT_MS,
    ),
  )

  try {
    const result = await Promise.race([parserPromise, timeoutPromise])
    return { result, mime }
  } catch (err) {
    if (err instanceof FileParseError) throw err
    throw new FileParseError(
      "parse_failed",
      err instanceof Error ? err.message : "Parser threw a non-error value.",
    )
  }
}

export const PARSER_CONSTANTS = {
  MAX_FILE_BYTES,
  MAX_PDF_PAGES,
  MAX_PLAINTEXT_RAW_BYTES,
  EXCERPT_MAX_CHARS,
  PARSE_TIMEOUT_MS,
} as const

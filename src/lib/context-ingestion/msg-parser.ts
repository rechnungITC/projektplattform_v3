/**
 * PROJ-70-δ — Outlook `.msg` (CFB) parser for kickoff context sources.
 *
 * Mirrors `file-parser.ts` shape: dynamic import (AC-δH-6 / AC-γH-8),
 * size + raw-text caps, FileParseError codes. Library:
 * `@kenjiuno/msgreader@1.28.0` (CIA-approved 2026-06-06,
 * APPROVED_WITH_FOLLOWUPS — the only maintained pure-JS CFB reader).
 *
 * Hardening (CIA AC-δH):
 *   - AC-δH-2: part-bomb guard — more than MAX_EMAIL_PARTS attachment
 *     entries → FileParseError("email_too_many_parts").
 *   - AC-δH-3: attachments are IGNORED, never extracted. msgreader's
 *     attachment-decode is a separate opt-in call (`getAttachment()`)
 *     which this module NEVER invokes — `fileData.attachments` is only
 *     read for its `.length`. This also rules out nested-.msg recursion.
 *   - AC-δH-4: msgreader doesn't throw on malformed CFB — it returns
 *     `{ dataType: null, error }`. Both that signal AND real throws map
 *     to FileParseError("msg_parse_failed").
 *   - AC-δH-5: body prefers the plain-text `fileData.body`; the HTML
 *     body is tag-stripped only when no plain text exists (Lock-6).
 *
 * Lock-3 (forward-compat for 70-ε): threading headers are regex-extracted
 * from the transport-header blob when Outlook preserved it.
 */

import type { EmailAddress, EmailMetadata, EmailParseResult } from "./eml-parser"
import { MAX_EMAIL_PARTS } from "./eml-parser"
import { FileParseError, PARSER_CONSTANTS } from "./file-parser"

/** Subset of msgreader's FieldsData we consume. */
interface MsgFieldsData {
  dataType: string | null
  error?: string
  subject?: string
  senderName?: string
  senderEmail?: string
  recipients?: Array<{
    name?: string
    email?: string
    recipType?: string
  }>
  body?: string
  bodyHtml?: string
  messageDeliveryTime?: string
  clientSubmitTime?: string
  creationTime?: string
  headers?: string
  attachments?: unknown[]
}

interface MsgReaderInstance {
  getFileData: () => MsgFieldsData
}

/** Minimal tag-strip for the bodyHtml fallback (AC-δH-5). Not a
 *  sanitizer — output goes into a plaintext DB column, never the DOM. */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

/** Lock-3 — pull threading headers out of the raw transport-header blob
 *  (present when Outlook kept the received headers; absent for sent
 *  items). Case-insensitive, tolerant of folded header lines. */
export function extractThreadingHeaders(headerBlob: string | undefined): {
  message_id: string | null
  in_reply_to: string | null
  references: string[]
} {
  if (!headerBlob) {
    return { message_id: null, in_reply_to: null, references: [] }
  }
  // Unfold RFC822 continuation lines before matching.
  const unfolded = headerBlob.replace(/\r?\n[ \t]+/g, " ")
  const grab = (name: string): string | null => {
    const m = unfolded.match(new RegExp(`^${name}:\\s*(.+)$`, "im"))
    return m ? m[1].trim() : null
  }
  const refsRaw = grab("References")
  return {
    message_id: grab("Message-ID"),
    in_reply_to: grab("In-Reply-To"),
    references: refsRaw ? (refsRaw.match(/<[^>]+>/g) ?? []) : [],
  }
}

function toIsoOrNull(value: string | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Parse an Outlook `.msg` buffer into excerpt + email metadata with the
 * same output shape as `parseEml` (AC-δ3).
 */
export async function parseMsg(buffer: Buffer): Promise<EmailParseResult> {
  if (buffer.length > PARSER_CONSTANTS.MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `MSG exceeds the ${PARSER_CONSTANTS.MAX_FILE_BYTES}-byte cap.`,
    )
  }

  // AC-δH-6 — dynamic import. msgreader publishes CJS with an ESM
  // double-default interop (`mod.default.default` is the class).
  const mod = (await import("@kenjiuno/msgreader")) as unknown as {
    default: { default?: new (buf: ArrayBuffer | Buffer) => MsgReaderInstance } & (
      new (buf: ArrayBuffer | Buffer) => MsgReaderInstance
    )
  }
  const MsgReader = mod.default.default ?? mod.default

  // AC-δH-4 — msgreader signals malformed input two ways: a throw, or a
  // `{ dataType: null, error }` result. Map both to msg_parse_failed.
  let fileData: MsgFieldsData
  try {
    const reader = new MsgReader(buffer)
    fileData = reader.getFileData()
  } catch (err) {
    throw new FileParseError(
      "msg_parse_failed",
      err instanceof Error ? err.message : "MSG could not be parsed.",
    )
  }
  if (!fileData || fileData.dataType !== "msg") {
    throw new FileParseError(
      "msg_parse_failed",
      fileData?.error ?? "Buffer is not a parsable Outlook MSG file.",
    )
  }

  // AC-δH-2 — part-bomb guard; AC-δH-3 — `.length` only, getAttachment()
  // is NEVER called.
  if ((fileData.attachments?.length ?? 0) > MAX_EMAIL_PARTS) {
    throw new FileParseError(
      "email_too_many_parts",
      `MSG has ${fileData.attachments?.length} attachments, max is ${MAX_EMAIL_PARTS}.`,
    )
  }

  // AC-δH-5 / Lock-6 — plain body first; HTML strip only as fallback.
  const raw = (fileData.body?.trim() || stripHtmlTags(fileData.bodyHtml ?? "")).trim()

  if (Buffer.byteLength(raw, "utf8") > PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES) {
    throw new FileParseError(
      "raw_text_cap_exceeded",
      "MSG body exceeds the 2 MB raw-text cap.",
    )
  }

  const excerpt =
    raw.length > PARSER_CONSTANTS.EXCERPT_MAX_CHARS
      ? raw.slice(0, PARSER_CONSTANTS.EXCERPT_MAX_CHARS)
      : raw

  const to: EmailAddress[] = []
  const cc: EmailAddress[] = []
  for (const r of fileData.recipients ?? []) {
    if (!r.email) continue
    const entry: EmailAddress = r.name
      ? { name: r.name, address: r.email }
      : { address: r.email }
    if ((r.recipType ?? "to").toLowerCase() === "cc") {
      cc.push(entry)
    } else {
      to.push(entry)
    }
  }

  const threading = extractThreadingHeaders(fileData.headers)

  const email: EmailMetadata = {
    email_subject: fileData.subject ?? null,
    email_from: fileData.senderEmail
      ? fileData.senderName
        ? { name: fileData.senderName, address: fileData.senderEmail }
        : { address: fileData.senderEmail }
      : null,
    email_to: to,
    email_cc: cc,
    email_date: toIsoOrNull(
      fileData.messageDeliveryTime ?? fileData.clientSubmitTime ?? fileData.creationTime,
    ),
    email_message_id: threading.message_id,
    email_in_reply_to: threading.in_reply_to,
    email_references: threading.references,
    email_format: "msg",
  }

  return {
    excerpt,
    raw_length: raw.length,
    page_count: 1,
    truncated: raw.length > PARSER_CONSTANTS.EXCERPT_MAX_CHARS,
    email,
  }
}

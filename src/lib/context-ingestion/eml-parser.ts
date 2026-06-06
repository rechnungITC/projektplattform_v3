/**
 * PROJ-70-δ — RFC822 `.eml` parser for kickoff context sources.
 *
 * Mirrors `file-parser.ts` shape: dynamic import (AC-δH-6 / AC-γH-8),
 * size + raw-text caps, FileParseError codes. Library: `mailparser@3.9.9`
 * (CIA-approved 2026-06-06, APPROVED_WITH_FOLLOWUPS).
 *
 * Hardening (CIA AC-δH):
 *   - AC-δH-1: `maxHtmlLengthToParse` 2 MB + `skipImageLinks` — caps the
 *     most expensive mailparser operation (HTML→text).
 *   - AC-δH-2: multipart-bomb guard — more than MAX_EMAIL_PARTS parsed
 *     attachments/parts → FileParseError("email_too_many_parts").
 *     The 20 s Promise.race timeout in parseFile stays the backstop.
 *   - AC-δH-3: attachments are IGNORED, never extracted or persisted.
 *     `parsed.attachments` is only read for its `.length` (the bomb
 *     guard); attachment buffers never leave this function.
 *   - AC-δH-5: excerpt prefers `parsed.text` (plaintext, mailparser
 *     strips HTML internally — Lock-6); raw HTML is never used directly.
 *
 * Lock-3 (forward-compat for 70-ε): threading headers (Message-ID,
 * In-Reply-To, References) are extracted into EmailMetadata even though
 * δ has no consumer yet.
 */

import { FileParseError, PARSER_CONSTANTS } from "./file-parser"

/** Max parsed MIME parts/attachments before we call it a bomb (AC-δH-2). */
export const MAX_EMAIL_PARTS = 50
/** AC-δH-1 — cap for mailparser's HTML→text conversion input. */
export const MAX_HTML_LENGTH_TO_PARSE = 2_000_000

export interface EmailAddress {
  name?: string
  address: string
}

/**
 * Open-shape email header extraction stored in
 * `context_sources.source_metadata` (Lock-5 — JSON, no dedicated table).
 * Field names follow the δ-architecture data-model section verbatim.
 */
export interface EmailMetadata {
  email_subject: string | null
  email_from: EmailAddress | null
  email_to: EmailAddress[]
  email_cc: EmailAddress[]
  email_date: string | null
  email_message_id: string | null
  email_in_reply_to: string | null
  email_references: string[]
  email_format: "eml" | "msg"
}

export interface EmailParseResult {
  /** Plaintext excerpt capped at EXCERPT_MAX_CHARS (HTML already
   *  stripped by mailparser — Lock-6). */
  excerpt: string
  raw_length: number
  page_count: number
  truncated: boolean
  email: EmailMetadata
}

/** mailparser's AddressObject shape (subset we consume). */
interface MailparserAddressObject {
  value: Array<{ name?: string; address?: string }>
}

/** `to`/`cc` can be a single AddressObject or an array of them when the
 *  header appears multiple times. Normalize to a flat EmailAddress[]. */
export function normalizeAddressList(
  input: MailparserAddressObject | MailparserAddressObject[] | undefined,
): EmailAddress[] {
  if (!input) return []
  const objects = Array.isArray(input) ? input : [input]
  const out: EmailAddress[] = []
  for (const obj of objects) {
    for (const entry of obj.value ?? []) {
      if (!entry.address) continue
      out.push(
        entry.name
          ? { name: entry.name, address: entry.address }
          : { address: entry.address },
      )
    }
  }
  return out
}

/**
 * Parse an RFC822 `.eml` buffer into excerpt + email metadata.
 *
 * Throws FileParseError on size/raw-text caps, multipart bombs, and
 * any mailparser failure (mapped to `parse_failed`). The caller
 * (`parseFile`) wraps this in the 20 s timeout (AC-δH-6).
 */
export async function parseEml(buffer: Buffer): Promise<EmailParseResult> {
  if (buffer.length > PARSER_CONSTANTS.MAX_FILE_BYTES) {
    throw new FileParseError(
      "size_exceeded",
      `EML exceeds the ${PARSER_CONSTANTS.MAX_FILE_BYTES}-byte cap.`,
    )
  }

  // AC-δH-6 — dynamic import (mirror AC-γH-8).
  const { simpleParser } = await import("mailparser")

  let parsed: Awaited<ReturnType<typeof simpleParser>>
  try {
    // AC-δH-1 — cap HTML→text input + skip embedded image data-URIs.
    parsed = await simpleParser(buffer, {
      maxHtmlLengthToParse: MAX_HTML_LENGTH_TO_PARSE,
      skipImageLinks: true,
    })
  } catch (err) {
    throw new FileParseError(
      "parse_failed",
      err instanceof Error ? err.message : "EML could not be parsed.",
    )
  }

  // AC-δH-2 — multipart-bomb guard. We only read `.length`; attachment
  // buffers are never extracted or persisted (AC-δH-3).
  if ((parsed.attachments?.length ?? 0) > MAX_EMAIL_PARTS) {
    throw new FileParseError(
      "email_too_many_parts",
      `Email has ${parsed.attachments.length} parts, max is ${MAX_EMAIL_PARTS}.`,
    )
  }

  // AC-δH-5 / Lock-6 — `parsed.text` is the plain-text body; for
  // HTML-only mails mailparser generates it from the (capped) HTML.
  const raw = (parsed.text ?? "").trim()

  if (Buffer.byteLength(raw, "utf8") > PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES) {
    throw new FileParseError(
      "raw_text_cap_exceeded",
      "EML body exceeds the 2 MB raw-text cap.",
    )
  }

  const excerpt =
    raw.length > PARSER_CONSTANTS.EXCERPT_MAX_CHARS
      ? raw.slice(0, PARSER_CONSTANTS.EXCERPT_MAX_CHARS)
      : raw

  const from = normalizeAddressList(
    parsed.from as MailparserAddressObject | undefined,
  )

  const email: EmailMetadata = {
    email_subject: parsed.subject ?? null,
    email_from: from[0] ?? null,
    email_to: normalizeAddressList(
      parsed.to as MailparserAddressObject | MailparserAddressObject[] | undefined,
    ),
    email_cc: normalizeAddressList(
      parsed.cc as MailparserAddressObject | MailparserAddressObject[] | undefined,
    ),
    email_date: parsed.date ? parsed.date.toISOString() : null,
    // Lock-3 — threading headers for ε's thread linking; not consumed in δ.
    email_message_id: parsed.messageId ?? null,
    email_in_reply_to: parsed.inReplyTo ?? null,
    email_references: Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [],
    email_format: "eml",
  }

  return {
    excerpt,
    raw_length: raw.length,
    page_count: 1,
    truncated: raw.length > PARSER_CONSTANTS.EXCERPT_MAX_CHARS,
    email,
  }
}

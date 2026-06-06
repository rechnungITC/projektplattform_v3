/**
 * PROJ-70-δ — eml-parser tests.
 *
 * Strategy: unlike the γ file-parser tests (which mock the heavy
 * binary libs), these run the REAL mailparser on small inline RFC822
 * strings — pure-JS, fast, and it verifies the actual extraction
 * contract (AC-δ2 + AC-δH-1/2/3/5 + Lock-3 threading headers).
 */

import { describe, expect, it } from "vitest"

import {
  MAX_EMAIL_PARTS,
  normalizeAddressList,
  parseEml,
} from "./eml-parser"
import { FileParseError, PARSER_CONSTANTS } from "./file-parser"

function buildEml(opts: {
  headers?: string[]
  body?: string
  htmlBody?: string
  attachmentCount?: number
}): Buffer {
  const headers = opts.headers ?? [
    "Message-ID: <kickoff-1@example.com>",
    "In-Reply-To: <pre-kickoff@example.com>",
    "References: <pre-kickoff@example.com> <even-earlier@example.com>",
    "Date: Mon, 01 Jun 2026 10:00:00 +0200",
    "From: Alice Lead <alice@example.com>",
    "To: Bob PM <bob@example.com>, Carol Dev <carol@example.com>",
    "Cc: Dave Sponsor <dave@example.com>",
    "Subject: ERP Kickoff Phase 1",
  ]

  const attachmentCount = opts.attachmentCount ?? 0
  if (attachmentCount === 0) {
    // Single-part mail — plain or HTML-only (mailparser derives `text`
    // from the HTML body when no text part exists).
    return Buffer.from(
      [
        ...headers,
        opts.htmlBody
          ? "Content-Type: text/html; charset=utf-8"
          : "Content-Type: text/plain; charset=utf-8",
        "",
        opts.htmlBody ?? opts.body ?? "Kickoff body",
      ].join("\r\n"),
    )
  }

  const boundary = "----proj70-delta-test-boundary"
  const parts: string[] = []
  parts.push(
    `--${boundary}`,
    opts.htmlBody
      ? "Content-Type: text/html; charset=utf-8"
      : "Content-Type: text/plain; charset=utf-8",
    "",
    opts.htmlBody ?? opts.body ?? "Kickoff body",
  )
  for (let i = 0; i < attachmentCount; i++) {
    parts.push(
      `--${boundary}`,
      "Content-Type: application/octet-stream",
      `Content-Disposition: attachment; filename="part-${i}.bin"`,
      "Content-Transfer-Encoding: base64",
      "",
      "QUJD", // "ABC"
    )
  }
  parts.push(`--${boundary}--`)

  return Buffer.from(
    [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      ...parts,
    ].join("\r\n"),
  )
}

describe("parseEml — AC-δ2 extraction", () => {
  it("extracts subject, from, to, cc, date and plain-text body", async () => {
    const result = await parseEml(buildEml({ body: "Hallo Team, Kickoff am Montag." }))

    expect(result.excerpt).toBe("Hallo Team, Kickoff am Montag.")
    expect(result.page_count).toBe(1)
    expect(result.truncated).toBe(false)
    expect(result.email.email_format).toBe("eml")
    expect(result.email.email_subject).toBe("ERP Kickoff Phase 1")
    expect(result.email.email_from).toEqual({
      name: "Alice Lead",
      address: "alice@example.com",
    })
    expect(result.email.email_to).toEqual([
      { name: "Bob PM", address: "bob@example.com" },
      { name: "Carol Dev", address: "carol@example.com" },
    ])
    expect(result.email.email_cc).toEqual([
      { name: "Dave Sponsor", address: "dave@example.com" },
    ])
    expect(result.email.email_date).toBe("2026-06-01T08:00:00.000Z")
  })

  it("extracts threading headers (Lock-3 forward-compat for ε)", async () => {
    const result = await parseEml(buildEml({}))
    expect(result.email.email_message_id).toBe("<kickoff-1@example.com>")
    expect(result.email.email_in_reply_to).toBe("<pre-kickoff@example.com>")
    expect(result.email.email_references).toEqual([
      "<pre-kickoff@example.com>",
      "<even-earlier@example.com>",
    ])
  })

  it("handles minimal mails without optional headers", async () => {
    const result = await parseEml(
      buildEml({
        headers: ["From: x@example.com", "Subject: Minimal"],
        body: "Body only",
      }),
    )
    expect(result.email.email_subject).toBe("Minimal")
    expect(result.email.email_from).toEqual({ address: "x@example.com" })
    expect(result.email.email_to).toEqual([])
    expect(result.email.email_cc).toEqual([])
    expect(result.email.email_message_id).toBeNull()
    expect(result.email.email_in_reply_to).toBeNull()
    expect(result.email.email_references).toEqual([])
    expect(result.email.email_date).toBeNull()
  })
})

describe("parseEml — Lock-6 / AC-δH-5 HTML stripping", () => {
  it("strips HTML to plain text before the excerpt is taken", async () => {
    const result = await parseEml(
      buildEml({
        htmlBody: "<p>Hallo <b>Team</b>,</p><p>Kickoff!</p>",
      }),
    )
    expect(result.excerpt).not.toContain("<")
    expect(result.excerpt).toContain("Hallo")
    expect(result.excerpt).toContain("Kickoff!")
  })
})

describe("parseEml — AC-δH-2 multipart-bomb guard", () => {
  it(`rejects more than ${MAX_EMAIL_PARTS} attachment parts`, async () => {
    await expect(
      parseEml(buildEml({ attachmentCount: MAX_EMAIL_PARTS + 1 })),
    ).rejects.toMatchObject({ code: "email_too_many_parts" })
  })

  it(`accepts exactly ${MAX_EMAIL_PARTS} attachment parts`, async () => {
    const result = await parseEml(
      buildEml({ attachmentCount: MAX_EMAIL_PARTS, body: "ok" }),
    )
    expect(result.excerpt).toBe("ok")
  })
})

describe("parseEml — AC-δH-3 attachments are ignored", () => {
  it("never leaks attachment content into excerpt or metadata", async () => {
    const result = await parseEml(
      buildEml({ attachmentCount: 3, body: "Nur der Body." }),
    )
    expect(result.excerpt).toBe("Nur der Body.")
    // "ABC" is the decoded attachment payload — must not appear.
    expect(result.excerpt).not.toContain("ABC")
    expect(JSON.stringify(result.email)).not.toContain("part-0.bin")
  })
})

describe("parseEml — caps", () => {
  it("rejects buffers above the 25 MB size cap", async () => {
    const big = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)
    await expect(parseEml(big)).rejects.toMatchObject({ code: "size_exceeded" })
  })

  it("rejects bodies above the 2 MB raw-text cap", async () => {
    const hugeBody = "x".repeat(PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES + 16)
    await expect(parseEml(buildEml({ body: hugeBody }))).rejects.toMatchObject({
      code: "raw_text_cap_exceeded",
    })
  })

  it("cuts the excerpt at 8000 chars and flags truncation", async () => {
    const body = "y".repeat(PARSER_CONSTANTS.EXCERPT_MAX_CHARS + 500)
    const result = await parseEml(buildEml({ body }))
    expect(result.excerpt).toHaveLength(PARSER_CONSTANTS.EXCERPT_MAX_CHARS)
    expect(result.truncated).toBe(true)
    expect(result.raw_length).toBe(body.length)
  })
})

describe("normalizeAddressList", () => {
  it("flattens a single AddressObject", () => {
    expect(
      normalizeAddressList({ value: [{ name: "A", address: "a@x.de" }] }),
    ).toEqual([{ name: "A", address: "a@x.de" }])
  })

  it("flattens an array of AddressObjects (repeated headers)", () => {
    expect(
      normalizeAddressList([
        { value: [{ address: "a@x.de" }] },
        { value: [{ address: "b@x.de" }] },
      ]),
    ).toEqual([{ address: "a@x.de" }, { address: "b@x.de" }])
  })

  it("drops entries without an address and handles undefined", () => {
    expect(normalizeAddressList(undefined)).toEqual([])
    expect(normalizeAddressList({ value: [{ name: "ghost" }] })).toEqual([])
  })
})

describe("parseEml — error wrapping", () => {
  it("throws FileParseError instances only", async () => {
    try {
      await parseEml(Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1))
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(FileParseError)
    }
  })
})

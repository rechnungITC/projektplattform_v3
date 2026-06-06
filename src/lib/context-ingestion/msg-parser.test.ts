/**
 * PROJ-70-δ — msg-parser tests.
 *
 * Strategy: mock `@kenjiuno/msgreader` (constructing real CFB binaries
 * in tests is impractical) and verify the wrapper contract: field
 * mapping (AC-δ3), malformed-input handling (AC-δH-4), part-bomb guard
 * (AC-δH-2), attachments-never-extracted (AC-δH-3), HTML fallback
 * (AC-δH-5) and threading-header extraction (Lock-3).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_EMAIL_PARTS } from "./eml-parser"
import { FileParseError, PARSER_CONSTANTS } from "./file-parser"
import { extractThreadingHeaders, parseMsg, stripHtmlTags } from "./msg-parser"

const getFileDataMock = vi.fn()
const getAttachmentMock = vi.fn()
const constructorSpy = vi.fn()

vi.mock("@kenjiuno/msgreader", () => {
  class MsgReaderMock {
    constructor(buf: unknown) {
      constructorSpy(buf)
    }
    getFileData() {
      return getFileDataMock()
    }
    getAttachment(...args: unknown[]) {
      return getAttachmentMock(...args)
    }
  }
  // Mirror the real package's CJS double-default interop.
  return { default: { default: MsgReaderMock } }
})

const VALID_FILE_DATA = {
  dataType: "msg",
  subject: "ERP Kickoff Phase 1",
  senderName: "Alice Lead",
  senderEmail: "alice@example.com",
  recipients: [
    { name: "Bob PM", email: "bob@example.com", recipType: "to" },
    { name: "Carol Dev", email: "carol@example.com", recipType: "to" },
    { name: "Dave Sponsor", email: "dave@example.com", recipType: "cc" },
  ],
  body: "Hallo Team, Kickoff am Montag.",
  messageDeliveryTime: "2026-06-01T08:00:00.000Z",
  headers:
    "Received: from mail.example.com\r\n" +
    "Message-ID: <kickoff-1@example.com>\r\n" +
    "In-Reply-To:\r\n <pre-kickoff@example.com>\r\n" +
    "References: <pre-kickoff@example.com>\r\n <even-earlier@example.com>\r\n",
  attachments: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("parseMsg — AC-δ3 extraction (same output shape as parseEml)", () => {
  it("maps subject, sender, to/cc split, date and body", async () => {
    getFileDataMock.mockReturnValueOnce(VALID_FILE_DATA)
    const result = await parseMsg(Buffer.from("fake-cfb"))

    expect(result.excerpt).toBe("Hallo Team, Kickoff am Montag.")
    expect(result.page_count).toBe(1)
    expect(result.email.email_format).toBe("msg")
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

  it("extracts threading headers from the transport-header blob (Lock-3)", async () => {
    getFileDataMock.mockReturnValueOnce(VALID_FILE_DATA)
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(result.email.email_message_id).toBe("<kickoff-1@example.com>")
    expect(result.email.email_in_reply_to).toBe("<pre-kickoff@example.com>")
    expect(result.email.email_references).toEqual([
      "<pre-kickoff@example.com>",
      "<even-earlier@example.com>",
    ])
  })

  it("handles sent-items without transport headers", async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      headers: undefined,
    })
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(result.email.email_message_id).toBeNull()
    expect(result.email.email_in_reply_to).toBeNull()
    expect(result.email.email_references).toEqual([])
  })
})

describe("parseMsg — AC-δH-4 malformed CFB", () => {
  it("maps dataType:null result to msg_parse_failed", async () => {
    getFileDataMock.mockReturnValueOnce({
      dataType: null,
      error: "Unsupported file type!",
    })
    await expect(parseMsg(Buffer.from("not-cfb"))).rejects.toMatchObject({
      code: "msg_parse_failed",
      message: "Unsupported file type!",
    })
  })

  it("maps reader throws to msg_parse_failed", async () => {
    getFileDataMock.mockImplementationOnce(() => {
      throw new Error("corrupt CFB directory")
    })
    await expect(parseMsg(Buffer.from("corrupt"))).rejects.toMatchObject({
      code: "msg_parse_failed",
    })
  })

  it("throws FileParseError instances only", async () => {
    getFileDataMock.mockReturnValueOnce({ dataType: null })
    try {
      await parseMsg(Buffer.from("x"))
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(FileParseError)
    }
  })
})

describe("parseMsg — AC-δH-2 part-bomb guard + AC-δH-3 attachments ignored", () => {
  it(`rejects more than ${MAX_EMAIL_PARTS} attachments`, async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      attachments: Array.from({ length: MAX_EMAIL_PARTS + 1 }, (_, i) => ({
        fileName: `bomb-${i}.bin`,
      })),
    })
    await expect(parseMsg(Buffer.from("fake-cfb"))).rejects.toMatchObject({
      code: "email_too_many_parts",
    })
  })

  it("NEVER calls getAttachment, even when attachments exist (AC-δH-3)", async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      attachments: [{ fileName: "budget.xlsx" }, { fileName: "plan.pdf" }],
    })
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(getAttachmentMock).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain("budget.xlsx")
  })
})

describe("parseMsg — AC-δH-5 body precedence", () => {
  it("prefers plain body over bodyHtml", async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      body: "Plain wins",
      bodyHtml: "<p>HTML loses</p>",
    })
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(result.excerpt).toBe("Plain wins")
  })

  it("falls back to tag-stripped bodyHtml when plain body is empty", async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      body: "",
      bodyHtml: "<p>Hallo <b>Team</b> &amp; Co</p>",
    })
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(result.excerpt).toBe("Hallo Team & Co")
    expect(result.excerpt).not.toContain("<")
  })
})

describe("parseMsg — caps", () => {
  it("rejects buffers above the 25 MB size cap without touching the reader", async () => {
    const big = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)
    await expect(parseMsg(big)).rejects.toMatchObject({ code: "size_exceeded" })
    expect(constructorSpy).not.toHaveBeenCalled()
  })

  it("rejects bodies above the 2 MB raw-text cap", async () => {
    getFileDataMock.mockReturnValueOnce({
      ...VALID_FILE_DATA,
      body: "x".repeat(PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES + 16),
    })
    await expect(parseMsg(Buffer.from("fake-cfb"))).rejects.toMatchObject({
      code: "raw_text_cap_exceeded",
    })
  })

  it("cuts the excerpt at 8000 chars and flags truncation", async () => {
    const body = "y".repeat(PARSER_CONSTANTS.EXCERPT_MAX_CHARS + 500)
    getFileDataMock.mockReturnValueOnce({ ...VALID_FILE_DATA, body })
    const result = await parseMsg(Buffer.from("fake-cfb"))
    expect(result.excerpt).toHaveLength(PARSER_CONSTANTS.EXCERPT_MAX_CHARS)
    expect(result.truncated).toBe(true)
  })
})

describe("stripHtmlTags", () => {
  it("removes tags, styles, scripts and decodes basic entities", () => {
    expect(
      stripHtmlTags(
        "<style>p{color:red}</style><script>alert(1)</script><p>A &lt;b&gt; &nbsp;B</p>",
      ),
    ).toBe("A <b> B")
  })
})

describe("extractThreadingHeaders", () => {
  it("unfolds folded header lines", () => {
    const result = extractThreadingHeaders(
      "References: <a@x>\r\n <b@x>\r\n\t<c@x>\r\nMessage-ID: <m@x>\r\n",
    )
    expect(result.references).toEqual(["<a@x>", "<b@x>", "<c@x>"])
    expect(result.message_id).toBe("<m@x>")
  })

  it("is case-insensitive on header names", () => {
    expect(extractThreadingHeaders("message-id: <low@x>\r\n").message_id).toBe(
      "<low@x>",
    )
  })

  it("returns nulls for undefined input", () => {
    expect(extractThreadingHeaders(undefined)).toEqual({
      message_id: null,
      in_reply_to: null,
      references: [],
    })
  })
})

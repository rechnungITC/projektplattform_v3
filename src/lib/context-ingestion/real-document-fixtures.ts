/**
 * PROJ-Y-142b — builders for REAL binary documents, used by the
 * `*.real.test.ts` suites that run the actual parser libraries instead of
 * `vi.mock` stand-ins.
 *
 * Not a test file itself (vitest only collects `*.test.ts`), and never
 * imported by production code — it exists so the DOCX/MSG/PDF byte
 * generators are written once rather than copied into three suites.
 *
 * Why real bytes matter: `file-parser.test.ts` mocks `pdfjs-dist`, `mammoth`
 * and `file-type`, and `msg-parser.test.ts` mocks `@kenjiuno/msgreader`, so
 * those suites stay green whether the installed library works, is broken or
 * is absent — they stayed green straight across the pdfjs 5 → 6 major bump
 * (PROJ-142). These builders close that gap for the formats where the bytes
 * can be generated from libraries already in the tree.
 */

/**
 * Minimal, structurally valid single-page PDF with one text-showing (`Tj`)
 * operator. Hand-rolled rather than a checked-in binary so the expected text
 * lives next to the assertion.
 */
export function buildPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [i, body] of objs.entries()) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  }

  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  return Buffer.from(pdf, "latin1")
}

/**
 * Real OOXML `.docx` (a ZIP with the three parts mammoth needs). Built with
 * `jszip`, which is already in the tree as mammoth's own dependency — so the
 * writer and the reader ship together, exactly as PROJ-79 does in
 * `src/lib/dms/mime.ooxml.test.ts`.
 */
export async function buildDocx(paragraphs: string[]): Promise<Buffer> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )

  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )

  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join("")

  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body>
</w:document>`,
  )

  return zip.generateAsync({ type: "nodebuffer" })
}

/** MAPI property tags used by `buildMsg`, in msgreader's stream-name form. */
export const MSG_PROP = {
  subject: "__substg1.0_0037001F",
  body: "__substg1.0_1000001F",
  senderName: "__substg1.0_0C1A001F",
  senderEmail: "__substg1.0_0C1F001F",
  bodyHtml: "__substg1.0_1013001F",
  messageId: "__substg1.0_1035001F",
  inReplyTo: "__substg1.0_1042001F",
  references: "__substg1.0_1039001F",
} as const

/**
 * Real Compound-File-Binary `.msg`.
 *
 * `msg-parser.test.ts` mocks `@kenjiuno/msgreader` on the stated grounds that
 * "constructing real CFB binaries in tests is impractical". That is no longer
 * true: the package ships its own CFB writer at `lib/Burner`, so we can burn
 * genuine CFB bytes and read them back with the real reader — no new
 * dependency, no checked-in binary fixture.
 *
 * Honest limitation: writer and reader come from the same package, so this
 * does not prove compatibility with Outlook-produced files. It does prove the
 * real CFB parse path executes, the real MAPI field mapping resolves, and our
 * wrapper's contract holds — which is the regression class a silent dependency
 * bump would otherwise slip past.
 *
 * `type` values are msgreader's `TypeEnum`: 5 = ROOT, 2 = DOCUMENT.
 */
export async function buildMsg(
  props: Partial<Record<keyof typeof MSG_PROP, string>>,
): Promise<Buffer> {
  const { burn } = (await import("@kenjiuno/msgreader/lib/Burner.js")) as {
    burn: (entries: unknown[]) => Uint8Array
  }

  const entries: unknown[] = [
    { name: "Root Entry", type: 5, children: [] as number[], length: 0 },
  ]
  const root = entries[0] as { children: number[] }

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue
    // PT_UNICODE (…001F) string properties are UTF-16LE.
    const bytes = new Uint8Array(Buffer.from(value, "utf16le"))
    root.children.push(entries.length)
    entries.push({
      name: MSG_PROP[key as keyof typeof MSG_PROP],
      type: 2,
      binaryProvider: () => bytes,
      length: bytes.length,
    })
  }

  return Buffer.from(burn(entries))
}

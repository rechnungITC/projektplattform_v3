/**
 * PROJ-146 — un-mocked verification of the PDF render path.
 *
 * Exercises EVERY puppeteer API that `src/lib/reports/puppeteer-render.ts`
 * uses, against the REAL production Chromium (`@sparticuz/chromium`, the same
 * binary Vercel runs) with the REAL production launch args, over REAL HTTP.
 *
 * Why this exists as its own script rather than a vitest case: the route tests
 * mock `renderSnapshotPdf` wholesale, so a breaking `puppeteer-core` upgrade
 * passes the suite untouched — the same blind spot PROJ-142 hit with
 * `pdfjs-dist` (mocked parser survived a major bump) and PROJ-Y-142b closed for
 * the document parsers. It stays out of the default vitest run because it
 * extracts a ~190 MB browser binary and launches it; run it deliberately.
 *
 *   npm run verify:pdf-render
 *   VERIFY_CHROME=/path/to/chrome npm run verify:pdf-render   # override binary
 *
 * Run it whenever `puppeteer-core` or `@sparticuz/chromium` moves.
 * Exits non-zero on the first broken call site.
 */
import http from "node:http"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"

const PRINT_READY_SELECTOR = "[data-report-print-ready='true']"
const ok = []
const fail = []
function check(name, cond, detail = "") {
  ;(cond ? ok : fail).push(`${name}${detail ? ` — ${detail}` : ""}`)
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

// Real HTTP server: page.goto() must get a genuine Response object, because the
// production code branches on response.ok()/status(). A data: URL yields null.
const server = http.createServer((req, res) => {
  if (req.url === "/slow.png") {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "image/png" })
      res.end(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC",
          "base64",
        ),
      )
    }, 120)
    return
  }
  if (req.url === "/missing") {
    res.writeHead(404, { "content-type": "text/plain" })
    res.end("nope")
    return
  }
  res.writeHead(200, {
    "content-type": "text/html",
    "x-saw-cookie": req.headers.cookie ?? "",
  })
  res.end(`<!doctype html><html><body>
    <h1>PROJ-146 render probe</h1>
    <img src="/slow.png" alt="">
    <div data-report-print-ready="true">ready</div>
  </body></html>`)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

// EXACTLY the production resolution path: @sparticuz/chromium's own binary,
// not a system or Playwright Chrome. This is the binary Vercel runs.
const EXECUTABLE = process.env.VERIFY_CHROME || (await chromium.executablePath())

let browser
try {
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 },
    executablePath: EXECUTABLE,
    headless: true,
  })
  check("puppeteer.launch({args: chromium.args, executablePath, headless})", true, EXECUTABLE)

  const version = await browser.version()
  check("browser.version() reachable over CDP", !!version, version)
  check("browser.connected getter", browser.connected === true, `= ${browser.connected}`)

  const page = await browser.newPage()
  check("browser.newPage()", !!page)

  await page.setExtraHTTPHeaders({ cookie: "sb-probe=1" })
  const response = await page.goto(`${origin}/print`, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  })
  check("page.goto() returns a Response (not null)", !!response)
  check("response.ok()", response.ok() === true)
  check("response.status()", response.status() === 200, `= ${response.status()}`)
  check(
    "page.setExtraHTTPHeaders() cookie actually sent",
    response.headers()["x-saw-cookie"] === "sb-probe=1",
    response.headers()["x-saw-cookie"],
  )

  await page.waitForSelector(PRINT_READY_SELECTOR, { timeout: 10_000 })
  check("page.waitForSelector(print-ready)", true)

  await page.emulateMediaType("print")
  check("page.emulateMediaType('print')", true)

  const assetResult = await page.evaluate(async (timeoutMs) => {
    const imagesReady = Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true })
              img.addEventListener("error", () => resolve(), { once: true })
            }),
        ),
    )
    await Promise.race([
      imagesReady,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ])
    return document.images.length
  }, 3_000)
  check("page.evaluate(asyncFn, arg) — waitForPageAssets shape", assetResult === 1, `images=${assetResult}`)

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
  })
  check("page.pdf({format:'A4', printBackground, margin})", !!pdf)
  check(
    "pdf .byteLength is usable",
    typeof pdf.byteLength === "number" && pdf.byteLength > 1000,
    `${pdf.byteLength} bytes`,
  )
  check(
    "pdf payload is a real PDF (%PDF- magic)",
    Buffer.from(pdf).subarray(0, 5).toString("latin1") === "%PDF-",
  )
  check(
    "pdf byte view type accepted by supabase upload (Uint8Array)",
    pdf instanceof Uint8Array,
    pdf.constructor.name,
  )

  const bad = await page.goto(`${origin}/missing`, { waitUntil: "domcontentloaded" })
  check(
    "non-OK response detected via response.ok()",
    bad.ok() === false && bad.status() === 404,
    `status ${bad.status()}`,
  )

  await page.close().catch(() => undefined)
  check("page.close()", true)
} catch (err) {
  check(`unexpected throw: ${err?.message ?? err}`, false)
} finally {
  if (browser) await browser.close().catch(() => undefined)
  server.close()
}

const pcVersion = (await import("puppeteer-core/package.json", { with: { type: "json" } }))
  .default.version
console.log(`\npuppeteer-core ${pcVersion}`)
console.log(`RESULT: ${ok.length} passed, ${fail.length} failed`)
process.exit(fail.length ? 1 : 0)

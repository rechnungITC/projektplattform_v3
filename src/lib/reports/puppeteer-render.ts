/**
 * PROJ-21 — synchronous PDF render via headless Chromium.
 *
 * Used by the snapshot create + retry routes. The puppeteer launch is
 * memoized per-process so warm Vercel functions skip the ~3 s cold
 * start. Uploads to the `reports` Supabase Storage bucket using the
 * service-role key (bucket is private — INSERT is service-role-only).
 *
 * Server-only. Never import from client code — `puppeteer-core` and
 * `@sparticuz/chromium` pull in browser binary references that would
 * blow the client bundle.
 */

import chromium from "@sparticuz/chromium"
import puppeteer, { type Browser } from "puppeteer-core"

import { createAdminClient } from "@/lib/supabase/admin"

interface RenderInput {
  /** Absolute origin (e.g. https://projektplattform-v3.vercel.app or
   *  http://localhost:3000) used to build the print URL. */
  origin: string
  snapshotId: string
  tenantId: string
  projectId: string
  /** When set, the request includes this Cookie header so the print
   *  route's RLS-gated SELECT succeeds against the same Supabase
   *  session as the create-snapshot caller. */
  cookieHeader?: string | null
}

export interface RenderResult {
  /** Storage key under the `reports` bucket. */
  storageKey: string
  /** PDF byte size — caller decides whether to log/warn at > 5 MB. */
  byteSize: number
  /** Total render duration in ms. */
  durationMs: number
}

let cachedBrowser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser
  }
  const executablePath = await chromium.executablePath()
  cachedBrowser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 },
    executablePath,
    headless: true,
  })
  return cachedBrowser
}

/**
 * Renders a snapshot's print URL to PDF and uploads it to Supabase
 * Storage. Returns the storage key + byte size + duration so the
 * caller can update `report_snapshots.pdf_storage_key` and
 * `pdf_status`.
 *
 * Throws on any failure (timeout, RLS denial, upload error). The API
 * route catches and downgrades the snapshot to `pdf_status='failed'`.
 */
export async function renderSnapshotPdf(input: RenderInput): Promise<RenderResult> {
  const startedAt = Date.now()
  const printUrl = `${input.origin.replace(/\/$/, "")}/reports/snapshots/${input.snapshotId}/print`
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    if (input.cookieHeader) {
      await page.setExtraHTTPHeaders({ Cookie: input.cookieHeader })
    }
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: 25_000,
    })
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    })

    const storageKey = `${input.tenantId}/${input.projectId}/${input.snapshotId}.pdf`
    const admin = createAdminClient()
    const { error: uploadError } = await admin.storage
      .from("reports")
      .upload(storageKey, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      })
    if (uploadError) {
      throw new Error(`storage upload failed: ${uploadError.message}`)
    }

    return {
      storageKey,
      byteSize: pdfBuffer.byteLength,
      durationMs: Date.now() - startedAt,
    }
  } finally {
    await page.close().catch(() => undefined)
  }
}

import type { PdfStatus } from "@/lib/reports/types"

export const STALE_PDF_PENDING_MS = 90_000

export function isPdfPendingStale(
  generatedAt: string,
  nowMs = Date.now(),
): boolean {
  const generatedMs = Date.parse(generatedAt)
  if (Number.isNaN(generatedMs)) return false
  return nowMs - generatedMs > STALE_PDF_PENDING_MS
}

export function normalizePdfStatus(
  status: PdfStatus,
  generatedAt: string,
  nowMs = Date.now(),
): PdfStatus {
  if (status !== "pending") return status
  return isPdfPendingStale(generatedAt, nowMs) ? "failed" : status
}

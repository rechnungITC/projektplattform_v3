import { createAdminClient } from "@/lib/supabase/admin"
import type { PdfStatus } from "@/lib/reports/types"

export async function updateSnapshotPdfStatus(
  snapshotId: string,
  updates: { pdf_status: PdfStatus; pdf_storage_key?: string },
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("report_snapshots")
    .update(updates)
    .eq("id", snapshotId)
  if (error) {
    throw new Error(`snapshot pdf status update failed: ${error.message}`)
  }
}

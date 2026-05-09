import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ExecutiveSummaryBody } from "@/components/reports/executive-summary-body"
import { StatusReportBody } from "@/components/reports/status-report-body"
import { createClient } from "@/lib/supabase/server"
import type { ReportSnapshot } from "@/lib/reports/types"

export const metadata: Metadata = {
  title: "Snapshot · Print",
  robots: { index: false, follow: false },
}

interface SnapshotPrintPageProps {
  params: Promise<{ snapshotId: string }>
}

/**
 * PROJ-21 — Puppeteer print source. Same data as the public HTML view
 * but stripped of all chrome so the headless Chromium captures a
 * clean, paginated PDF. Tech Design § "Datenfluss — Status-Report
 * erzeugen" calls this URL during the synchronous PDF render step.
 */
export default async function SnapshotPrintPage({
  params,
}: SnapshotPrintPageProps) {
  const { snapshotId } = await params

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("report_snapshots")
    .select(
      "id, tenant_id, project_id, kind, version, generated_by, generated_at, content, pdf_storage_key, pdf_status, ki_summary_classification, ki_provider",
    )
    .eq("id", snapshotId)
    .maybeSingle<ReportSnapshot>()

  if (error || !data) {
    notFound()
  }

  return (
    <div
      className="report-print bg-white p-8 text-foreground"
      data-report-print-ready="true"
    >
      {data.kind === "status_report" ? (
        <StatusReportBody version={data.version} content={data.content} />
      ) : (
        <ExecutiveSummaryBody version={data.version} content={data.content} />
      )}
    </div>
  )
}

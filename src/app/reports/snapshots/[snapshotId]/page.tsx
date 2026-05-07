import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ExecutiveSummaryBody } from "@/components/reports/executive-summary-body"
import { StatusReportBody } from "@/components/reports/status-report-body"
import { createClient } from "@/lib/supabase/server"
import {
  SNAPSHOT_KIND_LABELS,
  type ReportSnapshot,
} from "@/lib/reports/types"

export const metadata: Metadata = {
  title: "Snapshot · Projektplattform",
}

interface SnapshotPageProps {
  params: Promise<{ snapshotId: string }>
}

/**
 * PROJ-21 — public-facing-but-tenant-scoped HTML view of a frozen
 * report snapshot. RLS gates visibility: only tenant members of the
 * snapshot's tenant see content; everyone else gets a 404 (leak-safe).
 *
 * Lives outside the `(app)` layout group so the AppShell chrome
 * doesn't wrap it. Print stylesheet in the body components keeps the
 * layout clean for "Print to PDF" from the browser.
 */
export default async function SnapshotPage({ params }: SnapshotPageProps) {
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
    <main className="min-h-svh bg-background px-4 py-10 sm:px-8">
      <div className="theme-print mx-auto max-w-4xl rounded-lg border bg-background p-8 text-foreground shadow-sm print:border-0 print:shadow-none">
        {data.kind === "status_report" ? (
          <StatusReportBody version={data.version} content={data.content} />
        ) : (
          <ExecutiveSummaryBody version={data.version} content={data.content} />
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground print:hidden">
        {SNAPSHOT_KIND_LABELS[data.kind]} v{data.version} ·
        Snapshot-Ansicht · druck-bereit (Browser → Drucken → PDF)
      </p>
    </main>
  )
}

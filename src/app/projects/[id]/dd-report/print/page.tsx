import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DdReportBody } from "@/components/projects/ma/dd-report-body"
import type { DdReport } from "@/lib/ma-project/dd-findings-api"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "DD-Bericht · Print",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-116 — chrome-less print source for the consolidated DD report
 * (browser print-to-PDF, PROJ-21 pattern). Lives OUTSIDE the (app) route group
 * so it renders without the project-room sidebar/chrome.
 *
 * H2: the report is assembled by the SECURITY-INVOKER RPC dd_report_consolidated
 * called through the cookie-bound session client (createClient) — NEVER
 * service-role — so the need-to-know gate applies to the requesting user.
 */
export default async function DdReportPrintPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()

  // RLS-scoped: a user without access can't read the project → notFound.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string }>()

  if (!project) {
    notFound()
  }

  const { data, error } = await supabase.rpc("dd_report_consolidated", {
    p_project_id: id,
  })
  if (error) {
    notFound()
  }

  const report = (data ?? { streams: [], red_flags: [] }) as DdReport
  const generatedAt = new Date().toLocaleString("de-DE", {
    dateStyle: "long",
    timeStyle: "short",
  })

  return (
    <div
      className="theme-print report-print bg-background p-8 text-foreground"
      data-report-print-ready="true"
    >
      <header className="mb-8 border-b pb-4">
        <h1 className="text-xl font-bold">Due-Diligence-Bericht</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} · Stand: {generatedAt}
        </p>
      </header>
      <DdReportBody report={report} />
    </div>
  )
}
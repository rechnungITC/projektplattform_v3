import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DdReportBody } from "@/components/projects/ma/dd-report-body"
import { EMPTY_DD_REPORT, type DdReport } from "@/lib/ma-project/dd-findings-api"
import {
  logConfidentialReportRead,
  mustBlockOnLogFailure,
} from "@/lib/audit/confidential-read"
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

  const report = (data ?? EMPTY_DD_REPORT) as DdReport

  // PROJ-130-δ2: die Druckseite ist eine Austritts-Fläche — der Browser macht aus
  // ihr eine PDF-Datei. Deshalb wird hier ab `confidential` protokolliert (die
  // In-App-Ansicht derselben Auswertung erst bei `strict`). Der doppelte
  // Server-Render einer Seite erzeugt keine zweite Zeile: die RPC entprellt
  // `report_read` auf eine Zeile pro 15-Minuten-Fenster.
  const readLog = await logConfidentialReportRead(
    async (fn, args) => await supabase.rpc(fn, args),
    { projectId: id, report: "dd_report", surface: "print", payload: report }
  )
  // Ausfallverhalten wie überall in δ: bei `strict` fail-closed.
  if (mustBlockOnLogFailure(readLog)) {
    notFound()
  }
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
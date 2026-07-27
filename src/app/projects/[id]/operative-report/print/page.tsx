import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { OperativeReportBody } from "@/components/projects/ma/operative-report-body"
import { createClient } from "@/lib/supabase/server"
import { EMPTY_OPERATIVE_REPORT, type OperativeReport } from "@/types/operative-report"

export const metadata: Metadata = {
  title: "Operatives Reporting · Print",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-132 — chrome-less print source for the operative report (browser
 * print-to-PDF, PROJ-21 pattern). Lives OUTSIDE the (app) route group so it
 * renders without the project-room chrome.
 *
 * The report is assembled by the SECURITY-INVOKER RPC operative_report called
 * through the cookie-bound session client (createClient) — NEVER service-role —
 * so the need-to-know gate applies to the requesting user.
 */
export default async function OperativeReportPrintPage({ params }: PageProps) {
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

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: id,
  })
  if (error) {
    notFound()
  }

  const report = (data ?? EMPTY_OPERATIVE_REPORT) as OperativeReport

  // Resolve responsible-user display names (profiles readable under caller RLS).
  const ownerIds = Array.from(
    new Set(
      [
        ...report.tasks_overdue.tasks,
        ...report.deliverables_status.deliverables,
      ]
        .map((r) => r.responsible_user_id)
        .filter((x): x is string => Boolean(x))
    )
  )
  const userName = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ownerIds)
    for (const p of (profiles ?? []) as {
      id: string
      display_name: string | null
      email: string | null
    }[]) {
      userName.set(p.id, p.display_name ?? p.email?.split("@")[0] ?? "—")
    }
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
        <h1 className="text-xl font-bold">Operatives Reporting</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} · Stand: {generatedAt}
        </p>
      </header>
      <OperativeReportBody report={report} userName={userName} />
    </div>
  )
}

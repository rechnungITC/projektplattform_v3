import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SteeringReportBody } from "@/components/projects/ma/steering-report-body"
import { createClient } from "@/lib/supabase/server"
import { EMPTY_STEERING_REPORT, type SteeringReport } from "@/types/steering-report"

export const metadata: Metadata = {
  title: "Steering-Dashboard · Print",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-131 — chrome-less print source for the steering report (browser
 * print-to-PDF, PROJ-21 pattern). Lives OUTSIDE the (app) route group so it
 * renders without the project-room chrome.
 *
 * The report is assembled by the SECURITY-INVOKER RPC steering_report called
 * through the cookie-bound session client (createClient) — NEVER service-role —
 * so the need-to-know gate applies to the requesting user.
 */
export default async function SteeringReportPrintPage({ params }: PageProps) {
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

  const { data, error } = await supabase.rpc("steering_report", {
    p_project_id: id,
  })
  if (error) {
    notFound()
  }

  const report = (data ?? EMPTY_STEERING_REPORT) as SteeringReport

  // Resolve responsible-user display names (profiles readable under caller RLS).
  const ownerIds = Array.from(
    new Set(
      report.critical_tasks.tasks
        .map((t) => t.responsible_user_id)
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
        <h1 className="text-xl font-bold">Steering-Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} · Stand: {generatedAt}
        </p>
      </header>
      <SteeringReportBody report={report} userName={userName} />
    </div>
  )
}

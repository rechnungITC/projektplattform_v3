import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { parseOperativeReportFilters } from "@/app/api/projects/[id]/operative-report/route"
import { OperativeReportBody } from "@/components/projects/ma/operative-report-body"
import { createClient } from "@/lib/supabase/server"
import { EMPTY_OPERATIVE_REPORT, type OperativeReport } from "@/types/operative-report"

export const metadata: Metadata = {
  title: "Operatives Reporting · Print",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * PROJ-132 + PROJ-141-γ4/γ5 — chrome-less print source for the operative
 * report (browser print-to-PDF, PROJ-21 pattern). Lives OUTSIDE the (app)
 * route group so it renders without the project-room chrome.
 *
 * The report is assembled by the SECURITY-INVOKER RPC operative_report called
 * through the cookie-bound session client (createClient) — NEVER service-role
 * — so the need-to-know gate applies to the requesting user. γ4/γ5: the same
 * filter query params (workstream_id, owner_id, phase_id, classification) as
 * the on-screen view are threaded into the RPC so the printed PDF shows the
 * filtered set.
 */
export default async function OperativeReportPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const sp = await searchParams

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

  // Reuse the same filter parser as the GET route (single source of truth).
  const spEntries = Object.entries(sp).flatMap<[string, string]>(
    ([k, v]) => (typeof v === "string" ? [[k, v]] : [])
  )
  const parsed = parseOperativeReportFilters(new URLSearchParams(spEntries))
  const filters: {
    p_workstream_id: string | null
    p_owner_id: string | null
    p_phase_id: string | null
    p_classification: string | null
  } = parsed.ok
    ? parsed.filters
    : {
        p_workstream_id: null,
        p_owner_id: null,
        p_phase_id: null,
        p_classification: null,
      }

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: id,
    ...filters,
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

  const activeFilterLabels: string[] = []
  if (filters.p_workstream_id) activeFilterLabels.push("Workstream gefiltert")
  if (filters.p_owner_id) activeFilterLabels.push("Verantwortlicher gefiltert")
  if (filters.p_phase_id) activeFilterLabels.push("Phase gefiltert")
  if (filters.p_classification)
    activeFilterLabels.push(`Klassifikation: ${filters.p_classification}`)

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
        {activeFilterLabels.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Filter aktiv: {activeFilterLabels.join(" · ")}
          </p>
        ) : null}
      </header>
      <OperativeReportBody report={report} userName={userName} />
    </div>
  )
}

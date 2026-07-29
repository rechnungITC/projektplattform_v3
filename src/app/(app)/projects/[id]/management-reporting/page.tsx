import type { Metadata } from "next"

import { SteeringReportView } from "@/components/projects/ma/steering-report-view"

export const metadata: Metadata = {
  title: "Steering-Dashboard · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-131 — management / steering dashboard (Executive Sponsor / Steering
// Committee). Surfaced in the project-room nav for project_type='ma'
// (filterSectionsByProjectType). Read-only; the underlying steering_report RPC
// is need-to-know-scoped to the caller. CSV export per section + PDF via the
// /print page. Kaufpreis/Synergie shown as "not-yet-available" (PROJ-Y-131a).
export default async function ProjectManagementReportingPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <SteeringReportView projectId={id} />
    </div>
  )
}

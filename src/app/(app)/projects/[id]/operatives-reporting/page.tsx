import type { Metadata } from "next"

import { OperativeReportView } from "@/components/projects/ma/operative-report-view"

export const metadata: Metadata = {
  title: "Operatives Reporting · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-132 — operative reporting view (PMO / Deal Lead / Workstreams). Surfaced
// in the project-room nav for project_type='ma' (filterSectionsByProjectType).
// Read-only; the underlying RPC is need-to-know-scoped to the caller. CSV export
// per section + PDF via the /print page.
export default async function ProjectOperativeReportPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <OperativeReportView projectId={id} />
    </div>
  )
}

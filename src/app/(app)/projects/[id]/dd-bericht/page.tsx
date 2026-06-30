import type { Metadata } from "next"

import { DdReportView } from "@/components/projects/ma/dd-report-view"

export const metadata: Metadata = {
  title: "DD-Bericht · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-116 — consolidated DD report view. Surfaced in the project-room nav for
// project_type='ma' (filterSectionsByProjectType). Read-only; the underlying
// RPC is need-to-know-scoped to the caller. PDF export via the /print page.
export default async function ProjectDdReportPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <DdReportView projectId={id} />
    </div>
  )
}
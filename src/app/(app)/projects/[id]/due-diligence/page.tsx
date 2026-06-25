import type { Metadata } from "next"

import { DueDiligenceStreamsPage } from "@/components/projects/ma/due-diligence-streams-page"

export const metadata: Metadata = {
  title: "Due Diligence · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-112 — Due-Diligence streams overview. Surfaced in the project-room nav
// for project_type='ma' (filterSectionsByProjectType). Streams are visible to
// project members; activation/edit/status are manager-gated (in the component
// and server-side).
export default async function ProjectDueDiligencePage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <DueDiligenceStreamsPage projectId={id} />
    </div>
  )
}

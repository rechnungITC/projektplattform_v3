import type { Metadata } from "next"

import { CommunicationPage } from "@/components/projects/ma/communication-page"

export const metadata: Metadata = {
  title: "Kommunikationsmatrix · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-118 — M&A communication matrix (target groups × messages × channels ×
// dates) with a single-approver workflow. Surfaced in the project-room nav for
// project_type='ma' (filterSectionsByProjectType). Distinct route from the
// PROJ-13 Communication Center (`/kommunikation`). Read for project members
// (RLS + need-to-know gate); create/edit + workflow gated server-side (SoD).
export default async function ProjectKommunikationsmatrixPage({
  params,
}: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <CommunicationPage projectId={id} />
    </div>
  )
}

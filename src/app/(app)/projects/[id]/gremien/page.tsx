import type { Metadata } from "next"

import { CommitteesPage } from "@/components/projects/ma/committees-page"

export const metadata: Metadata = {
  title: "Gremien · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-98 — governance bodies (SteerCo / Core Team / IMO …). Surfaced in the
// project-room nav for project_type='ma' (filterSectionsByProjectType). Read
// for project members (RLS + need-to-know gate); create/edit + membership
// manager-gated (and enforced server-side).
export default async function ProjectGremienPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <CommitteesPage projectId={id} />
    </div>
  )
}
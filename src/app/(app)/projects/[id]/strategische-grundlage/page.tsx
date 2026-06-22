import type { Metadata } from "next"

import { MaFoundationCard } from "@/components/projects/ma/ma-foundation-card"

export const metadata: Metadata = {
  title: "Strategische Grundlage · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-94 — M&A strategic-foundation section. Only surfaced in the project-room
// nav for project_type='ma' (filterSectionsByProjectType); for other projects
// the card renders a "no M&A foundation" empty state.
export default async function ProjectMaFoundationPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <MaFoundationCard projectId={id} />
    </div>
  )
}

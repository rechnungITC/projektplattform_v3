import type { Metadata } from "next"

import { MaRolesRaciPage } from "@/components/projects/ma/ma-roles-raci-page"

export const metadata: Metadata = {
  title: "Rollen & RACI · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-97a/b — M&A roles responsibility view + RACI matrix editor. Surfaced in
// the project-room nav only for project_type='ma' (filterSectionsByProjectType).
export default async function ProjectMaRolesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <MaRolesRaciPage projectId={id} />
    </div>
  )
}
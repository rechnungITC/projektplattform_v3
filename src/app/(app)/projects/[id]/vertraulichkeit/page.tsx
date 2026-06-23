import type { Metadata } from "next"

import { ConfidentialityAccessCard } from "@/components/projects/ma/confidentiality-access-card"

export const metadata: Metadata = {
  title: "Vertraulichkeit & Zugriff · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-100b — need-to-know clearance management + who-can-see overview. Surfaced
// in the project-room nav for project_type='ma' (filterSectionsByProjectType);
// the card itself is manager-gated (tenant-admin / project-lead).
export default async function ProjectConfidentialityPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <ConfidentialityAccessCard projectId={id} />
    </div>
  )
}

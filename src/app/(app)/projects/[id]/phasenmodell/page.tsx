import type { Metadata } from "next"

import { MaPhaseCockpit } from "@/components/projects/ma/ma-phase-cockpit"

export const metadata: Metadata = {
  title: "Phasenmodell · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-95 — M&A phase-model cockpit. Surfaced in the project-room nav only for
// project_type='ma' (filterSectionsByProjectType). Activation + roadmap +
// mandate gate; reuses the existing phases stack.
export default async function ProjectMaPhaseModelPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <MaPhaseCockpit projectId={id} />
    </div>
  )
}
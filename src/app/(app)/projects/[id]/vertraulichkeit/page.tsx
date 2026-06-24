import type { Metadata } from "next"

import { GovernanceAccessPage } from "@/components/projects/ma/governance-access-page"

export const metadata: Metadata = {
  title: "Governance & Zugriff · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-99 / 128 / 129 — Governance & Access surface for M&A projects: external
// advisors, NDA register, need-to-know classification matrix, plus the PROJ-100b
// clearance management reused as the "Freischaltungen" tab. Surfaced in the
// project-room nav for project_type='ma' (filterSectionsByProjectType); the page
// is manager-gated (tenant-admin / project-lead).
export default async function ProjectGovernancePage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <GovernanceAccessPage projectId={id} />
    </div>
  )
}

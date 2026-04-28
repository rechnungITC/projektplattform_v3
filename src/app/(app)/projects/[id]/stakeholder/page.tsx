import type { Metadata } from "next"

import { StakeholderTabClient } from "@/components/projects/stakeholders/stakeholder-tab-client"

export const metadata: Metadata = {
  title: "Stakeholder · Projektplattform",
}

interface ProjectStakeholderPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectStakeholderPage({
  params,
}: ProjectStakeholderPageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <StakeholderTabClient projectId={id} />
    </div>
  )
}

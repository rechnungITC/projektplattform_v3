import type { Metadata } from "next"

import { StakeholderHealthPageClient } from "@/components/projects/stakeholder-health/stakeholder-health-page-client"

export const metadata: Metadata = {
  title: "Stakeholder-Health · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StakeholderHealthPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <StakeholderHealthPageClient projectId={id} />
    </div>
  )
}

import type { Metadata } from "next"

import { RiskTabClient } from "@/components/projects/risks/risk-tab-client"

export const metadata: Metadata = {
  title: "Risiken · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectRisikenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <RiskTabClient projectId={id} />
    </div>
  )
}

import type { Metadata } from "next"

import { DependenciesTabClient } from "@/components/projects/dependencies/dependencies-tab-client"

export const metadata: Metadata = {
  title: "Abhängigkeiten · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectAbhaengigkeitenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <DependenciesTabClient projectId={id} />
    </div>
  )
}

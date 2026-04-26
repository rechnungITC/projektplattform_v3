import type { Metadata } from "next"

import { ProjectHistorieClient } from "./historie-client"

export const metadata: Metadata = {
  title: "Historie · Projektplattform",
}

interface ProjectHistoriePageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectHistoriePage({
  params,
}: ProjectHistoriePageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectHistorieClient projectId={id} />
    </div>
  )
}

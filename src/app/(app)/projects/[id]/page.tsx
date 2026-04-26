import type { Metadata } from "next"

import { ProjectDetailClient } from "./project-detail-client"

export const metadata: Metadata = {
  title: "Project · Projektplattform",
}

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectDetailClient projectId={id} />
    </div>
  )
}

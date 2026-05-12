import type { Metadata } from "next"

import { ProjectGraphView } from "@/components/projects/project-graph-view"

export const metadata: Metadata = {
  title: "Projekt-Graph · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-58-θ — Project Graph route.
 *
 * The client view now defaults to a route-local 3D renderer and keeps
 * the earlier SVG graph as fallback for reduced motion / WebGL blockers.
 */
export default async function ProjectGraphPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectGraphView projectId={id} />
    </div>
  )
}

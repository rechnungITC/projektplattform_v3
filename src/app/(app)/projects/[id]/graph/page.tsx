import type { Metadata } from "next"

import { ProjectGraphView } from "@/components/projects/project-graph-view"

export const metadata: Metadata = {
  title: "Projekt-Graph · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-58-β-UI — Project Graph route.
 *
 * Renders the read-only graph snapshot delivered by
 * /api/projects/[id]/graph. The MVP layout is a no-new-dep
 * concentric SVG (rings by node kind around the project node).
 *
 * Library-based renderer (react-flow / cytoscape) + critical-path
 * overlay + edge editing + decision simulation remain deferred to
 * PROJ-58 γ/δ/ε/ζ — they will land once the library decision is
 * CIA-reviewed.
 */
export default async function ProjectGraphPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectGraphView projectId={id} />
    </div>
  )
}

import type { Metadata } from "next"

import { GraphShell } from "@/components/projects/graph-shell"

export const metadata: Metadata = {
  title: "Projekt-Graph · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * PROJ-58-θ + PROJ-65 ε.1 — Project Graph route.
 *
 * GraphShell wraps the existing PROJ-58 relationship view and the new
 * PROJ-65 trajectory view behind a mode toggle. Each mode is its own
 * client component owning its snapshot fetch.
 */
export default async function ProjectGraphPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <GraphShell projectId={id} />
    </div>
  )
}

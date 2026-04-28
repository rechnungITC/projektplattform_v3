import type { Metadata } from "next"

import { DecisionsTabClient } from "@/components/projects/decisions/decisions-tab-client"

export const metadata: Metadata = {
  title: "Entscheidungen · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectEntscheidungenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <DecisionsTabClient projectId={id} />
    </div>
  )
}

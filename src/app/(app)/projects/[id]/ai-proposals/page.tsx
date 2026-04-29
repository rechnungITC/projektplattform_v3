import type { Metadata } from "next"

import { AiProposalsTabClient } from "@/components/projects/ai-proposals/ai-proposals-tab-client"

export const metadata: Metadata = {
  title: "KI-Vorschläge · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectAiProposalsPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <AiProposalsTabClient projectId={id} />
    </div>
  )
}

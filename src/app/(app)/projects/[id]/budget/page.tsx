import type { Metadata } from "next"

import { ProjectBudgetTabClient } from "@/components/budget/project-budget-tab-client"

export const metadata: Metadata = {
  title: "Budget · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectBudgetPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectBudgetTabClient projectId={id} />
    </div>
  )
}

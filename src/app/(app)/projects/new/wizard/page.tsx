import type { Metadata } from "next"

import { WizardClient } from "@/components/projects/wizard/wizard-client"

export const metadata: Metadata = {
  title: "Neues Projekt · Projektplattform",
}

interface ProjectWizardPageProps {
  searchParams: Promise<{ draftId?: string }>
}

export default async function ProjectWizardPage({
  searchParams,
}: ProjectWizardPageProps) {
  const { draftId } = await searchParams
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <WizardClient draftId={draftId} />
    </div>
  )
}

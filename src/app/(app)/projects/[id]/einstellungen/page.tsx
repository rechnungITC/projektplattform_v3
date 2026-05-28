import type { Metadata } from "next"

import { ProjectSettingsClient } from "@/components/projects/settings/project-settings-client"

export const metadata: Metadata = {
  title: "Einstellungen · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectEinstellungenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Projekteinstellungen
        </h1>
        <p className="text-sm text-muted-foreground">
          Projektspezifische Optionen und Governance-Schalter.
        </p>
      </header>
      <ProjectSettingsClient projectId={id} />
    </div>
  )
}

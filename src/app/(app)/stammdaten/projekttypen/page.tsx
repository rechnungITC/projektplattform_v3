import type { Metadata } from "next"

import { ProjectTypesPageClient } from "@/components/master-data/project-types-page-client"

export const metadata: Metadata = {
  title: "Projekttypen · Stammdaten",
}

export default function StammdatenProjekttypenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectTypesPageClient />
    </div>
  )
}

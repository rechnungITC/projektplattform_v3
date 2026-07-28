import type { Metadata } from "next"

import { MaProjectTemplatesPageClient } from "@/components/master-data/ma-project-templates-page-client"

export const metadata: Metadata = {
  title: "Projekt-Vorlagen · Stammdaten",
}

export default function StammdatenMaProjectTemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <MaProjectTemplatesPageClient />
    </div>
  )
}

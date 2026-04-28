import type { Metadata } from "next"

import { ComingSoon } from "@/components/projects/coming-soon"

export const metadata: Metadata = {
  title: "KI-Vorschläge · Projektplattform",
}

export default function ProjectAiProposalsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoon
        feature="KI-Vorschläge"
        featureId="PROJ-12"
        description="Kontext-Ingest und KI-gestützte Vorschläge mit Quellen­nachweis und Review-Workflow."
      />
    </div>
  )
}

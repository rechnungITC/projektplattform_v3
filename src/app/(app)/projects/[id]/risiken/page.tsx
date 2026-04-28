import type { Metadata } from "next"

import { ComingSoon } from "@/components/projects/coming-soon"

export const metadata: Metadata = {
  title: "Risiken · Projektplattform",
}

export default function ProjectRisikenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoon
        feature="Risiken & Entscheidungen"
        featureId="PROJ-20"
        description="Cross-cutting Risk Register und Entscheidungs-Katalog mit Audit-Trail."
      />
    </div>
  )
}

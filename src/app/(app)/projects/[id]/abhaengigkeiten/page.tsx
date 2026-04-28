import type { Metadata } from "next"

import { ComingSoon } from "@/components/projects/coming-soon"

export const metadata: Metadata = {
  title: "Abhängigkeiten · Projektplattform",
}

export default function ProjectAbhaengigkeitenPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoon
        feature="Abhängigkeiten"
        featureId="PROJ-9"
        description="Visualisierung der Work-Item-Abhängigkeiten. API existiert, UI-Sicht steht aus."
      />
    </div>
  )
}

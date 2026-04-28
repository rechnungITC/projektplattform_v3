import type { Metadata } from "next"

import { ComingSoon } from "@/components/projects/coming-soon"

export const metadata: Metadata = {
  title: "Freigaben · Projektplattform",
}

export default function ProjectGovernancePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ComingSoon
        feature="Freigaben & Governance"
        featureId="PROJ-18"
        description="Compliance-Automatik, Freigabe-Gates und Prozess-Templates (ISO/DSGVO/etc.)."
      />
    </div>
  )
}

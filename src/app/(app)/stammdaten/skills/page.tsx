import type { Metadata } from "next"

import { SkillsPageClient } from "@/components/master-data/skills-page-client"

export const metadata: Metadata = {
  title: "Skills · Stammdaten",
}

export default function StammdatenSkillsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <SkillsPageClient />
    </div>
  )
}

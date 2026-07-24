import type { Metadata } from "next"

import { SkillsCatalogClient } from "@/components/skills/skills-catalog-client"

export const metadata: Metadata = {
  title: "Skills",
}

export default function SkillsCatalogPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <SkillsCatalogClient />
    </div>
  )
}

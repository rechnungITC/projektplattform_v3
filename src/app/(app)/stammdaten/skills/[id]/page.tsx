import type { Metadata } from "next"

import { SkillDetailClient } from "@/components/master-data/skill-detail-client"

export const metadata: Metadata = {
  title: "Skill · Stammdaten",
}

export default async function StammdatenSkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <SkillDetailClient skillId={id} />
    </div>
  )
}

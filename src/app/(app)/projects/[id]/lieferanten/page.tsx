import type { Metadata } from "next"

import { ProjectVendorTabClient } from "@/components/vendors/project-vendor-tab-client"

export const metadata: Metadata = {
  title: "Lieferanten · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectLieferantenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectVendorTabClient projectId={id} />
    </div>
  )
}

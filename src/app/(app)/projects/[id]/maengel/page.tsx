import { ConstructionDefectsPage } from "@/components/construction/construction-defects-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-45-β — construction "Mängel" tab: the defect register of one building
// project. Reporting is open to every project member (lock L15); deadlines,
// status changes and the four-eyes review sit with the site management.
export default async function ProjectConstructionDefectsPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ConstructionDefectsPage projectId={id} />
    </div>
  )
}

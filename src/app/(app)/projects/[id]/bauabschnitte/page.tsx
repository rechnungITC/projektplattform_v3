import { ConstructionSectionsPage } from "@/components/construction/construction-sections-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-45-α — construction "Bauabschnitte" tab: the free-depth spatial
// breakdown (Bauteil → Geschoss → Einheit) that work items and risks hang on.
export default async function ProjectConstructionSectionsPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <ConstructionSectionsPage projectId={id} />
    </div>
  )
}

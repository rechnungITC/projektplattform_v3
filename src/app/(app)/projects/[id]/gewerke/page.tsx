import { ProjectTradesPage } from "@/components/construction/project-trades-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-45-α — construction "Gewerke" tab: which trades work on this project,
// who is responsible, and the site manager's own traffic light.
export default async function ProjectConstructionTradesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectTradesPage projectId={id} />
    </div>
  )
}

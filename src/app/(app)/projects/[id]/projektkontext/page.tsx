import { ProjectContextPage } from "@/components/projects/project-context/project-context-page"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectContextRoute({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectContextPage projectId={id} />
    </div>
  )
}

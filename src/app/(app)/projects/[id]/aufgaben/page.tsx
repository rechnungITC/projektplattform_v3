import { MaTasksPage } from "@/components/projects/ma/ma-tasks-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-101 — M&A "Aufgaben" tab: operative tasks (work_items kind='task') with
// Verantwortlicher, Frist, Phase, Status + optional Workstream tag.
export default async function ProjectAufgabenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <MaTasksPage projectId={id} />
    </div>
  )
}

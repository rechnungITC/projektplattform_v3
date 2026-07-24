import { DmsPage } from "@/components/projects/dms/dms-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-79-α — "Dokumente" tab: project document tree (folders + uploads),
// core for all project types.
export default async function ProjectDokumentePage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <DmsPage projectId={id} />
    </div>
  )
}

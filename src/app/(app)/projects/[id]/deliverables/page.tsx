import { DeliverablesPage } from "@/components/projects/ma/deliverables-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-104 — M&A "Deliverables" tab: catalogue of deliverables per phase +
// workstream with status lifecycle, document links, and RACI.
export default async function ProjectDeliverablesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <DeliverablesPage projectId={id} />
    </div>
  )
}

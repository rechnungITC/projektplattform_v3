import { WorkstreamsPage } from "@/components/projects/ma/workstreams-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-102 — M&A "Workstreams" tab: per-project steering units with RAG status,
// phase spans, and a task/risk dashboard.
export default async function ProjectWorkstreamsPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <WorkstreamsPage projectId={id} />
    </div>
  )
}

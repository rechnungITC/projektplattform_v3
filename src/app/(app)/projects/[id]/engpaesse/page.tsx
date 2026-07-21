import { MaBottlenecksPage } from "@/components/projects/ma/ma-bottlenecks-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-103 — M&A "Engpässe" tab: project-wide, cross-workstream view of all open
// tasks with days-overdue, quick filters, Top-3 bottlenecks and CSV export.
// Read-only; need-to-know is enforced server-side by the INVOKER RPC.
export default async function ProjectEngpaessePage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <MaBottlenecksPage projectId={id} />
    </div>
  )
}

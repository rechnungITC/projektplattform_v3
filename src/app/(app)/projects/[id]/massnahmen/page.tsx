import { MaMeasuresPage } from "@/components/projects/ma/ma-measures-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-109 — M&A "Maßnahmen" tab: read-only measures overview per risk /
// risk-owner / workstream, with a soft coverage hint for active-but-uncovered
// risks (AC3). A measure = a work_item linked to a risk via risk_links.
export default async function ProjectMassnahmenPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <MaMeasuresPage projectId={id} />
    </div>
  )
}

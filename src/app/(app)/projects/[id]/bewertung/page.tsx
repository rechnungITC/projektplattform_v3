import { ValuationsPage } from "@/components/projects/ma/valuations-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-120 — M&A "Bewertung" tab: the deal's valuation register. An immutable
// version chain whose head is the "Aktuelle Bewertungssicht" (price band,
// method, as-of date, author), with links to DD findings and to the valuation
// artifact itself (external link — the platform never hosts the model).
export default async function ProjectValuationPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <ValuationsPage projectId={id} />
    </div>
  )
}

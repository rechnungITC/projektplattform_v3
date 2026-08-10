import { SpaIssuesPage } from "@/components/projects/ma/spa-issues-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-122 — M&A "SPA Issues" tab: contract negotiation points with both
// sides' positions, negotiation status, need-to-know confidentiality and CSV
// export.
export default async function ProjectSpaIssuesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <SpaIssuesPage projectId={id} />
    </div>
  )
}

import { StageGatesPage } from "@/components/projects/ma/stage-gates-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-110 — M&A "Stage-Gates" tab: the 9 stage gates that authorize phase
// transitions, each with a pre-read and a 3-way decision (Freigabe / Auflage /
// Abbruch) that writes an immutable PROJ-20 decision.
export default async function ProjectStageGatesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <StageGatesPage projectId={id} />
    </div>
  )
}

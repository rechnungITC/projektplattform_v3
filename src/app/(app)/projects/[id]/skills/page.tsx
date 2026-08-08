import { ProjectSkillsPage } from "@/components/projects/skills/project-skills-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-78 — "Projekt-Skills" tab: the skill set assigned to this project
// (auto-resolved at creation + manual additions), with add / remove and the
// deliberately triggered, purely additive "Skills abgleichen" action.
export default async function ProjectSkillsRoute({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <ProjectSkillsPage projectId={id} />
    </div>
  )
}
